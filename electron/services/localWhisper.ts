import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { spawn, spawnSync, type ChildProcess } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import * as Sentry from '@sentry/electron/main';
import { t } from '../i18n.ts';
import { getWritableBinDir } from '../utils/paths.ts';
import { buildSpawnArgs, ensureAsciiSafePath, getAsciiSafeTempPath } from '../utils/shell.ts';
import { ExpectedError } from '../utils/expectedError.ts';

export interface SubtitleItem {
  start: string;
  end: string;
  text: string;
}

export type TranscribeStatus = 'success' | 'empty' | 'empty_with_error';

export interface TranscribeResult {
  segments: SubtitleItem[];
  status: TranscribeStatus;
  /** Only present when status is 'empty_with_error' */
  errorHint?: string;
}

export type WhisperSource = 'Custom' | 'Portable' | 'Bundled' | 'Dev' | 'unknown';

export interface WhisperDetails {
  path: string;
  source: WhisperSource;
  version: string;
  gpuSupport: boolean;
}

export class LocalWhisperService {
  public getBinaryPathWithSource(customBinaryPath?: string): {
    path: string;
    source: WhisperSource;
  } {
    if (customBinaryPath && fs.existsSync(customBinaryPath)) {
      return { path: customBinaryPath, source: 'Custom' };
    }
    const binaryPath = this.getBinaryPath(customBinaryPath);
    return { path: binaryPath, source: binaryPath ? 'Bundled' : 'unknown' };
  }

  public getBinaryPath(customBinaryPath?: string): string {
    // If custom path is provided, use it directly without any discovery logic
    if (customBinaryPath && fs.existsSync(customBinaryPath)) {
      return customBinaryPath;
    }

    // Fallback: Check bundled resources (only default locations)
    const binaryName = process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli';
    const exePath = app.getPath('exe');
    const exeDir = path.dirname(exePath);

    const possiblePaths = [
      path.join(getWritableBinDir(), binaryName),
      path.join(exeDir, 'resources', binaryName),
      path.join(exeDir, binaryName),
      path.join(process.resourcesPath, binaryName),
    ];

    // Add dev mode check
    if (!app.isPackaged) {
      possiblePaths.push(path.join(process.cwd(), 'resources', binaryName));
      // Also check adjacent to main entry resources if needed
      possiblePaths.push(path.join(app.getAppPath(), '..', 'resources', binaryName));
    }

    for (const p of possiblePaths) {
      if (fs.existsSync(p)) return p;
    }

    return '';
  }

  private getVadModelPath(): string | null {
    const modelName = 'ggml-silero-v6.2.0.bin';
    const exePath = app.getPath('exe');
    const exeDir = path.dirname(exePath);
    const possiblePaths: string[] = [];

    if (app.isPackaged) {
      possiblePaths.push(path.join(exeDir, modelName));
      possiblePaths.push(path.join(process.resourcesPath, modelName));
    } else {
      const projectRoot = path.join(app.getAppPath(), '..');
      possiblePaths.push(path.join(projectRoot, 'resources', modelName));
      possiblePaths.push(path.join(app.getAppPath(), 'resources', modelName));
    }

    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        console.log(`[DEBUG] [LocalWhisper] Found VAD model at: ${p}`);
        return p;
      } else {
        console.log(`[DEBUG] [LocalWhisper] VAD model not found at: ${p}`);
      }
    }

    console.warn(`[LocalWhisper] VAD model not found. Searched at: ${possiblePaths.join(', ')}`);
    Sentry.captureMessage('VAD model not found', {
      level: 'warning',
      extra: { searchedPaths: possiblePaths },
    });
    return null;
  }

  private activeProcesses: Map<string, ChildProcess> = new Map();
  private isCancelled = false;
  // Cached whisper-details probe result, keyed by resolved binary path so
  // a switch between Custom/Bundled gets a fresh probe. Eliminates re-probe
  // cost on About-tab refreshes within a session.
  private cachedDetails: Map<string, WhisperDetails> = new Map();

  validateModel(filePath: string): { valid: boolean; error?: string } {
    try {
      if (!fs.existsSync(filePath)) {
        return { valid: false, error: t('localWhisper.modelNotExist') };
      }
      if (!filePath.endsWith('.bin')) {
        return { valid: false, error: t('localWhisper.modelInvalidFormat') };
      }
      const stats = fs.statSync(filePath);
      if (stats.size < 50 * 1024 * 1024) {
        return { valid: false, error: t('localWhisper.modelTooSmall') };
      }

      // Check magic number for GGML/GGUF format compatibility
      const fd = fs.openSync(filePath, 'r');
      const buffer = Buffer.alloc(4);
      fs.readSync(fd, buffer, 0, 4, 0);
      fs.closeSync(fd);

      const magic = buffer.readUInt32LE(0);
      const GGML_MAGIC = 0x67676d6c; // "ggml" in little-endian
      const GGUF_MAGIC = 0x46554747; // "GGUF" in little-endian

      if (magic !== GGML_MAGIC && magic !== GGUF_MAGIC) {
        return { valid: false, error: t('localWhisper.modelIncompatibleFormat') };
      }

      return { valid: true };
    } catch (_error) {
      return { valid: false, error: t('localWhisper.modelReadError') };
    }
  }

  abort() {
    this.isCancelled = true;
    this.activeProcesses.forEach((process, id) => {
      console.log(`[DEBUG] [LocalWhisper] Aborting process ${id}`);
      process.kill();
    });
    this.activeProcesses.clear();
  }

  /**
   * Detect GPU/CUDA-related errors from whisper CLI stderr.
   * Used to trigger automatic CPU fallback with `-ng` flag.
   *
   * Must match actual error patterns, not normal init logs like
   * "ggml_cuda_init: found 1 CUDA devices:" which also contain "cuda".
   * Real errors: "CUDA error: ...", "CUBLAS error: ...", "GGML_CUDA error"
   */
  private isGpuError(errorMessage: string): boolean {
    const lower = errorMessage.toLowerCase();
    return (
      lower.includes('cuda error') ||
      lower.includes('cublas error') ||
      lower.includes('coreml error') ||
      lower.includes('metal error') ||
      lower.includes('unsupported toolchain') ||
      lower.includes('ptx was compiled')
    );
  }

  /**
   * Spawn whisper CLI and wait for result. Does NOT clean up the input file —
   * caller is responsible so retries can reuse it.
   */
  private _runWhisperProcess(
    binaryPath: string,
    args: string[],
    jobId: string,
    inputPath: string,
    onLog?: (message: string) => void
  ): Promise<TranscribeResult> {
    if (onLog)
      onLog(`[DEBUG] [LocalWhisper] Spawning (Job ${jobId}): ${binaryPath} ${args.join(' ')}`);
    console.log(`[DEBUG] [LocalWhisper] Spawning (Job ${jobId}): ${binaryPath} ${args.join(' ')}`);

    return new Promise((resolve, reject) => {
      const spawnConfig = buildSpawnArgs(binaryPath, args);
      const proc = spawn(spawnConfig.command, spawnConfig.args, {
        windowsHide: true,
        ...spawnConfig.options,
      });
      this.activeProcesses.set(jobId, proc);

      let stderr = '';
      let stdoutBuffer = '';
      let stderrBuffer = '';

      proc.stdout?.on('data', (data) => {
        const chunk = data.toString();
        stdoutBuffer += chunk;
        const lines = stdoutBuffer.split('\n');
        stdoutBuffer = lines.pop() || '';
      });

      proc.stderr?.on('data', (data) => {
        const chunk = data.toString();
        stderr += chunk;
        stderrBuffer += chunk;

        const lines = stderrBuffer.split('\n');
        stderrBuffer = lines.pop() || '';

        lines.forEach((line) => {
          if (line.trim()) {
            const lowerLine = line.toLowerCase();
            if (
              lowerLine.includes('error') ||
              lowerLine.includes('exception') ||
              lowerLine.includes('failed') ||
              lowerLine.includes('panic') ||
              lowerLine.includes('fatal')
            ) {
              if (onLog) onLog(`[ERROR] [Whisper CLI] ${line}`);
              console.error(`[LocalWhisper] ${line}`);
            }
          }
        });
      });

      proc.on('close', async (code, signal) => {
        this.activeProcesses.delete(jobId);

        if (code === null) {
          if (this.isCancelled) {
            console.log(`[LocalWhisper] Process cancelled by user (signal: ${signal})`);
            reject(new ExpectedError(`Process cancelled (signal: ${signal})`));
          } else {
            console.error(`[LocalWhisper] Process killed by OS (signal: ${signal})`);
            reject(new Error(`Process killed by OS (signal: ${signal})`));
          }
          return;
        }

        if (code !== 0) {
          const errorMsg = `Process exited with code ${code}`;
          console.error(`[LocalWhisper] ${errorMsg}`);
          if (onLog) onLog(`[ERROR] [LocalWhisper] Error: ${errorMsg}`);
          if (onLog) onLog(`[ERROR] [LocalWhisper] Stderr: ${stderr}`);
          reject(new Error(`Whisper CLI failed with code ${code}: ${stderr}`));
          return;
        }

        const outputPath = `${inputPath}.json`;

        try {
          if (!fs.existsSync(outputPath)) {
            reject(new Error('Output JSON file not generated'));
            return;
          }

          const jsonContent = await fs.promises.readFile(outputPath, 'utf-8');
          // Sanitize control characters that whisper.cpp may emit unescaped via fprintf
          // eslint-disable-next-line no-control-regex
          const sanitized = jsonContent.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
          const result = JSON.parse(sanitized);

          const subtitles: SubtitleItem[] = (result.transcription || []).map((item: any) => ({
            start: item.timestamps.from,
            end: item.timestamps.to,
            text: item.text.trim(),
          }));

          let status: TranscribeStatus = 'success';
          let errorHint: string | undefined;

          if (subtitles.length === 0) {
            const stderrLower = stderr.toLowerCase();
            const hasErrorIndicators =
              stderrLower.includes('error') ||
              stderrLower.includes('failed') ||
              stderrLower.includes('exception') ||
              stderrLower.includes('panic') ||
              stderrLower.includes('fatal');

            if (hasErrorIndicators) {
              status = 'empty_with_error';
              const lines = stderr.split('\n');
              const errorLine = lines.find((line) => {
                const lower = line.toLowerCase();
                return (
                  lower.includes('error') ||
                  lower.includes('failed') ||
                  lower.includes('exception') ||
                  lower.includes('panic') ||
                  lower.includes('fatal')
                );
              });
              errorHint = errorLine?.trim().slice(0, 200) || stderr.slice(0, 200);
            } else {
              status = 'empty';
            }
          }

          resolve({ segments: subtitles, status, errorHint });
        } catch (error) {
          reject(error);
        } finally {
          // Only clean up the output JSON — input file may be needed for retry
          try {
            if (fs.existsSync(outputPath)) await fs.promises.unlink(outputPath);
          } catch (e) {
            console.error('Failed to cleanup output file:', e);
          }
        }
      });

      proc.on('error', (err) => {
        this.activeProcesses.delete(jobId);
        reject(err);
      });
    });
  }

  async transcribe(
    audioBuffer: ArrayBuffer,
    modelPath: string,
    language: string = 'auto',
    threads: number = 4,
    onLog?: (message: string) => void,
    customBinaryPath?: string,
    gpuSupport?: boolean
  ): Promise<TranscribeResult> {
    // Reset cancellation flag at start of new transcription
    this.isCancelled = false;

    // Validate model first
    const validation = this.validateModel(modelPath);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const jobId = uuidv4();
    const inputPath = getAsciiSafeTempPath(`whisper_input_${jobId}.wav`);

    // Write buffer to file
    await fs.promises.writeFile(inputPath, Buffer.from(audioBuffer));

    // Track ASCII-safe symlink cleanups (must be outside try for catch block access)
    const cleanups: (() => Promise<void>)[] = [];

    try {
      // Priority-based binary path resolution: Custom -> Portable -> Bundled -> Dev
      const binaryPath = this.getBinaryPath(customBinaryPath);

      if (!binaryPath) {
        throw new Error(t('localWhisper.binaryNotFound'));
      }

      if (onLog) {
        console.log(`[DEBUG] [LocalWhisper] Using Binary Path: ${binaryPath}`);
        onLog(`[DEBUG] [LocalWhisper] Using Binary Path: ${binaryPath}`);
      }

      // Workaround: many whisper.cpp builds use C runtime main(argc, argv) which
      // converts UTF-16 to system ANSI code page, then assume UTF-8 internally.
      // This corrupts non-ASCII paths. Create ASCII-safe symlinks as a workaround.
      const safeModel = await ensureAsciiSafePath(modelPath);
      cleanups.push(safeModel.cleanup);

      // Construct arguments
      const args = [
        '-m',
        safeModel.safePath,
        '-f',
        inputPath,
        '-oj', // Output JSON
        '-l',
        language,
        '-t',
        threads.toString(),
        '-bs',
        '2', // Beam search optimization: 2.35x faster than default (5), quality loss <1%
        '--split-on-word', // Split subtitles at word boundaries for better readability
        '--print-progress', // Show progress for better user experience
        '--entropy-thold',
        '2.4', // Entropy threshold to filter out low-quality/repetitive output (default 2.4)
        '-tp',
        '0.6', // Temperature to break repetition loops while maintaining quality (changed from --temperature)
        '-fa', // Flash attention: reduces GPU VRAM usage and improves speed (default in our build, explicit for clarity)
      ];

      // Add VAD arguments if model exists
      const vadModelPath = this.getVadModelPath();
      if (vadModelPath) {
        const safeVad = await ensureAsciiSafePath(vadModelPath);
        cleanups.push(safeVad.cleanup);
        args.push('--vad-model', safeVad.safePath);
        args.push('-vt', '0.50'); // VAD threshold (default 0.50)
        args.push('-vo', '0.10'); // VAD samples overlap (default 0.10)
        if (onLog)
          onLog(`[DEBUG] [LocalWhisper] VAD enabled with model: ${path.basename(vadModelPath)}`);
        console.log(`[DEBUG] [LocalWhisper] VAD enabled with model: ${vadModelPath}`);
      } else {
        if (onLog) onLog(`[WARN] [LocalWhisper] VAD model not found, running without VAD.`);
        console.warn(`[LocalWhisper] VAD model not found, running without VAD.`);
      }

      // Proactively disable GPU when detection says no GPU support,
      // to avoid hard crashes on ancient GPUs that die during init
      if (gpuSupport === false) {
        args.push('-ng');
        if (onLog) onLog('[DEBUG] [LocalWhisper] GPU not supported — using CPU mode (-ng)');
      }

      // First attempt: run with current GPU settings
      try {
        return await this._runWhisperProcess(binaryPath, args, jobId, inputPath, onLog);
      } catch (error: any) {
        // If GPU error and not cancelled, retry with CPU-only mode (-ng)
        if (!this.isCancelled && !args.includes('-ng') && this.isGpuError(error.message)) {
          console.warn('[LocalWhisper] GPU error detected, retrying with CPU mode (-ng)...');
          if (onLog)
            onLog('[WARN] [LocalWhisper] GPU transcription failed, retrying with CPU mode...');

          const cpuJobId = uuidv4();
          return await this._runWhisperProcess(
            binaryPath,
            [...args, '-ng'],
            cpuJobId,
            inputPath,
            onLog
          );
        }
        throw error;
      }
    } finally {
      // Cleanup temp files (input WAV + symlinks) after all attempts
      try {
        if (fs.existsSync(inputPath)) await fs.promises.unlink(inputPath);
        for (const cleanup of cleanups) await cleanup();
      } catch (e) {
        console.error('Failed to cleanup temp files:', e);
      }
    }
  }

  /**
   * Probe a whisper binary once for its version + help output (used for GPU
   * detection). Synchronous (spawnSync). Returns version=null when no version
   * string could be parsed from either `--version` or `-h`.
   *
   * 30s timeout on --version: cold-start of a CUDA/Metal-linked whisper binary
   * on a fresh app launch can exceed 5s when AV scans the binary or Gatekeeper
   * verifies signatures.
   */
  private probeWhisperBinary(binaryPath: string): {
    version: string | null;
    helpOutput: string;
    diag: Record<string, unknown>;
  } {
    const versionConfig = buildSpawnArgs(binaryPath, ['--version']);
    const versionResult = spawnSync(versionConfig.command, versionConfig.args, {
      windowsHide: true,
      timeout: 30000,
    });
    const versionOutput =
      (versionResult.stdout?.toString() || '') + (versionResult.stderr?.toString() || '');

    // Use -h for GPU detection (and fallback version detection for older builds)
    const spawnConfig = buildSpawnArgs(binaryPath, ['-h']);
    const result = spawnSync(spawnConfig.command, spawnConfig.args, { windowsHide: true });
    const helpOutput = (result.stdout?.toString() || '') + (result.stderr?.toString() || '');

    const match =
      versionOutput.match(/whisper\.cpp v?(\d+\.\d+\.\d+)/i) ||
      versionOutput.match(/v?(\d+\.\d+\.\d+)/i) ||
      helpOutput.match(/whisper\.cpp v?(\d+\.\d+\.\d+)/i) ||
      helpOutput.match(/v?(\d+\.\d+\.\d+)/i);

    return {
      version: match ? `v${match[1]}` : null,
      helpOutput,
      diag: {
        versionExitCode: versionResult.status,
        versionSignal: versionResult.signal,
        versionError: versionResult.error?.message,
        helpExitCode: result.status,
        helpSignal: result.signal,
        helpError: result.error?.message,
      },
    };
  }

  async getWhisperDetails(customBinaryPath?: string): Promise<WhisperDetails> {
    const info = this.getBinaryPathWithSource(customBinaryPath);
    const details: WhisperDetails = {
      path: info.path,
      source: info.source,
      version: 'unknown',
      gpuSupport: false,
    };

    if (!info.path) return { ...details, version: 'Not found' };

    const cached = this.cachedDetails.get(info.path);
    if (cached) return cached;

    try {
      let probe = this.probeWhisperBinary(info.path);

      // Transient cold-start probe failures (AV scan / cold disk / Gatekeeper
      // verification) are the dominant source of MIOSUB-37 noise — the SAME
      // binary parses fine on a later attempt (confirmed: a Bundled v1.8.6 user
      // failed at startup, parsed v1.8.6 ~70 min later). Retry once after a short
      // warm-up delay, and only capture to Sentry if the retry ALSO fails.
      //
      // Custom builds are skipped entirely: they often don't embed a version
      // string and produced the bulk of the original MIOSUB-37 volume. 'unknown'
      // still works correctly and the About tab shows the source as "Custom".
      if (!probe.version && info.source !== 'Custom') {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const retry = this.probeWhisperBinary(info.path);
        if (retry.version) {
          probe = retry; // cold-start transient — recovered, no Sentry noise
        } else {
          console.warn(
            `[LocalWhisper] Version parse failed (2 attempts), output: ${retry.helpOutput.trim().slice(0, 200)}`
          );
          Sentry.captureMessage('Whisper version parse failed', {
            level: 'warning',
            extra: {
              output: retry.helpOutput.trim().slice(0, 500),
              attempt1: probe.diag,
              attempt2: retry.diag,
              binaryPath: info.path,
              source: info.source,
            },
          });
          probe = retry; // use latest help output for GPU detection
        }
      }

      details.version = probe.version ?? 'unknown';

      // Detect GPU support
      // Search for specific GPU acceleration library names in build info
      // Note: Avoid generic 'GPU' as it appears in help text (e.g., --no-gpu flag)
      // Note: Avoid 'OpenVINO' as it appears in help text as --ov-e-device option even for CPU-only builds
      const gpuKeywords = [
        'CUDA',
        'cuBLAS',
        'Metal',
        'CoreML',
        'OpenCL',
        'CLBlast',
        'Vulkan',
        'GGML_CUDA',
        'GGML_METAL',
        'BLAS = 1',
      ];

      const matchedKeywords = gpuKeywords.filter((key) => probe.helpOutput.includes(key));
      details.gpuSupport = matchedKeywords.length > 0;
    } catch (e) {
      console.warn('[LocalWhisperService] Failed to get whisper details:', e);
      Sentry.captureException(e, { tags: { action: 'get-whisper-details' } });
    }

    // Only cache when version probing actually succeeded — a transient
    // 'unknown' (custom build, timeout, parse failure) must not be locked
    // in for the rest of the process lifetime.
    if (details.version !== 'unknown' && details.version !== 'Not found') {
      this.cachedDetails.set(info.path, details);
    }
    return details;
  }

  async getVersion(customBinaryPath?: string): Promise<string> {
    const details = await this.getWhisperDetails(customBinaryPath);
    return `${details.version} (${details.source}${details.gpuSupport ? ' + GPU' : ''})`;
  }
}

export const localWhisperService = new LocalWhisperService();
