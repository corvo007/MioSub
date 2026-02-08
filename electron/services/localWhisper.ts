import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { spawn, type ChildProcess } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import { t } from '../i18n.ts';
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
    return null;
  }

  private activeProcesses: Map<string, ChildProcess> = new Map();
  private isCancelled = false;

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

  async transcribe(
    audioBuffer: ArrayBuffer,
    modelPath: string,
    language: string = 'auto',
    threads: number = 4,
    onLog?: (message: string) => void,
    customBinaryPath?: string
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

      if (onLog)
        onLog(`[DEBUG] [LocalWhisper] Spawning (Job ${jobId}): ${binaryPath} ${args.join(' ')}`);
      console.log(
        `[DEBUG] [LocalWhisper] Spawning (Job ${jobId}): ${binaryPath} ${args.join(' ')}`
      );

      return new Promise((resolve, reject) => {
        // Build spawn arguments with UTF-8 code page support for Windows
        const spawnConfig = buildSpawnArgs(binaryPath, args);
        const process = spawn(spawnConfig.command, spawnConfig.args, {
          windowsHide: true,
          ...spawnConfig.options,
        });
        this.activeProcesses.set(jobId, process);

        let stderr = '';
        let stdoutBuffer = '';
        let stderrBuffer = '';

        process.stdout?.on('data', (data) => {
          const chunk = data.toString();
          stdoutBuffer += chunk;

          const lines = stdoutBuffer.split('\n');
          stdoutBuffer = lines.pop() || ''; // Keep the last incomplete line

          lines.forEach((_line) => {
            // stdout processing if needed in future
          });
        });

        process.stderr?.on('data', (data) => {
          const chunk = data.toString();
          stderr += chunk;
          stderrBuffer += chunk;

          const lines = stderrBuffer.split('\n');
          stderrBuffer = lines.pop() || ''; // Keep the last incomplete line

          lines.forEach((line) => {
            if (line.trim()) {
              // Intermediate output from stderr (progress) -> DEBUG
              // Only log errors/warnings to avoid spam
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

        process.on('close', async (code, signal) => {
          this.activeProcesses.delete(jobId); // Remove from active map

          if (code === null) {
            // Process was killed by signal
            if (this.isCancelled) {
              // User-initiated cancellation → expected, don't report to Sentry
              console.log(`[LocalWhisper] Process cancelled by user (signal: ${signal})`);
              reject(new ExpectedError(`Process cancelled (signal: ${signal})`));
            } else {
              // OS-level kill (SIGABRT, OOM, etc.) → unexpected, report to Sentry
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

          // Read output JSON
          // Whisper.cpp generates file with .json appended to input filename
          const outputPath = `${inputPath}.json`;

          try {
            if (!fs.existsSync(outputPath)) {
              reject(new Error('Output JSON file not generated'));
              return;
            }

            const jsonContent = await fs.promises.readFile(outputPath, 'utf-8');

            // Log the raw JSON content (or a summary if too large, but user asked for "all")
            // console.log(`[DEBUG] [LocalWhisper] JSON Output: ${jsonContent}`);
            // if (onLog) onLog(`[DEBUG] [LocalWhisper] JSON Output: ${jsonContent}`);

            const result = JSON.parse(jsonContent);

            const subtitles: SubtitleItem[] = (result.transcription || []).map((item: any) => ({
              start: item.timestamps.from,
              end: item.timestamps.to,
              text: item.text.trim(),
            }));

            // Determine status based on results and stderr
            let status: TranscribeStatus = 'success';
            let errorHint: string | undefined;

            if (subtitles.length === 0) {
              // Check if stderr contains error indicators
              const stderrLower = stderr.toLowerCase();
              const hasErrorIndicators =
                stderrLower.includes('error') ||
                stderrLower.includes('failed') ||
                stderrLower.includes('exception') ||
                stderrLower.includes('panic') ||
                stderrLower.includes('fatal');

              if (hasErrorIndicators) {
                status = 'empty_with_error';
                // Extract a meaningful hint from stderr (first line with error keyword)
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
            // Cleanup
            try {
              if (fs.existsSync(inputPath)) await fs.promises.unlink(inputPath);
              if (fs.existsSync(outputPath)) await fs.promises.unlink(outputPath);
              for (const cleanup of cleanups) await cleanup();
            } catch (e) {
              console.error('Failed to cleanup temp files:', e);
            }
          }
        });

        process.on('error', (err) => {
          this.activeProcesses.delete(jobId);
          reject(err);
        });
      });
    } catch (error) {
      // Ensure cleanup if spawn fails
      if (fs.existsSync(inputPath)) await fs.promises.unlink(inputPath);
      for (const cleanup of cleanups) await cleanup();
      throw error;
    }
  }

  async getWhisperDetails(customBinaryPath?: string): Promise<WhisperDetails> {
    const info = this.getBinaryPathWithSource(customBinaryPath);
    const details: WhisperDetails = {
      path: info.path,
      source: info.source,
      version: 'unknown',
      gpuSupport: false,
    };

    if (!info.path) return details;

    try {
      const { spawnSync } = await import('child_process');

      // Try --version first (supported in our custom builds v1.8.4+)
      const versionConfig = buildSpawnArgs(info.path, ['--version']);
      const versionResult = spawnSync(versionConfig.command, versionConfig.args, {
        windowsHide: true,
        timeout: 5000,
      });
      const versionOutput =
        (versionResult.stdout?.toString() || '') + (versionResult.stderr?.toString() || '');
      const versionMatch =
        versionOutput.match(/whisper\.cpp v?(\d+\.\d+\.\d+)/i) ||
        versionOutput.match(/v?(\d+\.\d+\.\d+)/i);
      if (versionMatch) {
        details.version = `v${versionMatch[1]}`;
      }

      // Use -h for GPU detection (and fallback version detection)
      const spawnConfig = buildSpawnArgs(info.path, ['-h']);
      const result = spawnSync(spawnConfig.command, spawnConfig.args, { windowsHide: true });
      const output = (result.stdout?.toString() || '') + (result.stderr?.toString() || '');

      // Fallback version detection from -h output (older builds without --version)
      if (!versionMatch) {
        const helpVersionMatch =
          output.match(/whisper\.cpp v?(\d+\.\d+\.\d+)/i) || output.match(/v?(\d+\.\d+\.\d+)/i);
        details.version = helpVersionMatch ? `v${helpVersionMatch[1]}` : 'unknown';
      }

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

      // Log which keywords matched
      const matchedKeywords = gpuKeywords.filter((key) => output.includes(key));
      // console.log('[DEBUG] [LocalWhisper] getWhisperDetails - Matched GPU keywords:', matchedKeywords);

      details.gpuSupport = matchedKeywords.length > 0;
    } catch (e) {
      console.warn('[LocalWhisperService] Failed to get whisper details:', e);
    }

    return details;
  }

  async getVersion(customBinaryPath?: string): Promise<string> {
    const details = await this.getWhisperDetails(customBinaryPath);
    return `${details.version} (${details.source}${details.gpuSupport ? ' + GPU' : ''})`;
  }
}

export const localWhisperService = new LocalWhisperService();
