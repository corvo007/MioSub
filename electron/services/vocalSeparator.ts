import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { spawn, type ChildProcess } from 'child_process';
import * as Sentry from '@sentry/electron/main';
import { t } from '../i18n.ts';
import { getBinaryPath } from '../utils/paths.ts';
import { buildSpawnArgs, ensureAsciiSafePath } from '../utils/shell.ts';
import { ExpectedError } from '../utils/expectedError.ts';
import { extractAudioFromVideo } from './ffmpegAudioExtractor.ts';

export interface VocalSeparationInput {
  videoPath: string;
  modelPath: string;
}

export interface VocalSeparationResult {
  vocalsPath: string;
}

export class VocalSeparator {
  private activeProcesses: Map<string, ChildProcess> = new Map();
  private processSeq = 0;

  /**
   * Detect if GPU (Vulkan) is available.
   * Returns false on non-Windows platforms (no prebuilt binaries).
   *
   * NOTE: Even if Vulkan is detected, BSRoformer may fail due to shader compilation issues.
   * Known issue: Q8_0 models fail with "NVVM compilation failed" on some GPU/driver combinations.
   * Workaround: Use CPU backend (set BSR_FORCE_CPU=1) or try FP16 models instead.
   */
  detectGpu(): boolean {
    // Check binary exists first
    const binaryName = process.platform === 'win32' ? 'bs-roformer-cli.exe' : 'bs-roformer-cli';
    const binaryPath = getBinaryPath(binaryName);
    if (!fs.existsSync(binaryPath)) {
      Sentry.captureMessage('BSRoformer binary not found', {
        level: 'warning',
        extra: { binaryPath, platform: process.platform },
      });
      return false;
    }

    // Vulkan runtime present = has Vulkan-capable GPU driver
    // However, this doesn't guarantee BSRoformer will work (shader compilation may fail)
    if (process.platform === 'win32') {
      return fs.existsSync('C:\\Windows\\System32\\vulkan-1.dll');
    }
    return false;
  }

  /**
   * Separate vocals from video/audio file.
   */
  async separate(
    videoPath: string,
    modelPath: string,
    onProgress?: (percent: number) => void,
    signal?: AbortSignal
  ): Promise<VocalSeparationResult> {
    // Step 1: Ensure ASCII-safe paths for video and model
    const { safePath: safeVideoPath, cleanup: cleanupVideo } = await ensureAsciiSafePath(videoPath);
    const { safePath: safeModelPath, cleanup: cleanupModel } = await ensureAsciiSafePath(modelPath);

    // Step 2: Extract audio to WAV (44.1kHz stereo as required by MelBandRoformer)
    const tempDir = os.tmpdir();
    const timestamp = Date.now();

    let inputWav: string | null = null;

    try {
      inputWav = await extractAudioFromVideo(safeVideoPath, {
        format: 'wav',
        sampleRate: 44100,
        channels: 2,
        codec: 'pcm_s16le', // 16-bit PCM for BSRoformer compatibility
      });

      // Verify extracted audio file
      console.log(`[VocalSeparator] Extracted audio path: ${inputWav}`);
      if (!fs.existsSync(inputWav)) {
        throw new Error(`Extracted audio file does not exist: ${inputWav}`);
      }
      const stats = fs.statSync(inputWav);
      console.log(`[VocalSeparator] Audio file size: ${stats.size} bytes`);

      // Wait for file system to flush (Windows file handle release)
      // Scale delay based on file size: 200ms base + 1ms per MB
      const delayMs = Math.max(200, 200 + Math.floor(stats.size / (1024 * 1024)));
      console.log(`[VocalSeparator] Waiting ${delayMs}ms for file system flush...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));

      // Step 3: Run BSRoformer
      const binaryPath = getBinaryPath(
        process.platform === 'win32' ? 'bs-roformer-cli.exe' : 'bs-roformer-cli'
      );
      if (!fs.existsSync(binaryPath)) {
        throw new ExpectedError(`BSRoformer binary not found: ${binaryPath}`);
      }
      if (!fs.existsSync(safeModelPath)) {
        throw new ExpectedError(`Model file not found: ${modelPath}`);
      }
      const outputBase = path.join(tempDir, `mbr_output_${timestamp}`);

      const {
        command,
        args: spawnArgs,
        options: spawnOptions,
      } = buildSpawnArgs(binaryPath, [safeModelPath, inputWav, outputBase]);

      console.log(
        `[VocalSeparator] Spawning: ${command} ${spawnArgs.map((a) => `"${a}"`).join(' ')}`
      );
      const proc = spawn(command, spawnArgs, { ...spawnOptions, windowsHide: true });
      const processId = `vocal-${Date.now()}-${++this.processSeq}`;
      this.activeProcesses.set(processId, proc);

      // Handle abort signal
      const onAbort = () => {
        console.log(`[VocalSeparator] Aborting vocal separation (process ${processId})`);
        proc.kill('SIGTERM');
        this.activeProcesses.delete(processId);
      };

      if (signal) {
        if (signal.aborted) {
          onAbort();
          throw new ExpectedError(t('services:pipeline.errors.cancelled'));
        }
        signal.addEventListener('abort', onAbort);
      }

      let stderr = '';
      let stdout = '';
      proc.stderr?.on('data', (data) => {
        const line = data.toString();
        stderr += line;
        // Parse progress: "[=====>   ] 42 %"
        const match = line.match(/\]\s+(\d+)\s*%/);
        if (match && onProgress) {
          onProgress(parseInt(match[1], 10));
        }
      });
      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      const { code: exitCode, signal: exitSignal } = await new Promise<{
        code: number | null;
        signal: NodeJS.Signals | null;
      }>((resolve, reject) => {
        proc.on('close', (code, sig) => {
          this.activeProcesses.delete(processId);
          signal?.removeEventListener('abort', onAbort);
          resolve({ code, signal: sig });
        });
        proc.on('error', (err) => {
          this.activeProcesses.delete(processId);
          signal?.removeEventListener('abort', onAbort);
          reject(err);
        });
      });

      // Check if process was killed (abort)
      if (exitSignal || signal?.aborted) {
        throw new ExpectedError(t('services:pipeline.errors.cancelled'));
      }

      console.log(`[VocalSeparator] Process exited with code ${exitCode}`);
      if (stdout.length > 0) console.log(`[VocalSeparator] stdout:\n${stdout}`);
      if (stderr.length > 0) console.log(`[VocalSeparator] stderr:\n${stderr}`);

      if (exitCode !== 0) {
        // Extract key error line for message
        const errorLines = stderr
          .split('\n')
          .filter((line) => line.toLowerCase().includes('error'));
        const keyError =
          errorLines[errorLines.length - 1] || stderr.trim().split('\n').pop() || 'Unknown error';

        // Report to Sentry with full context
        const error = new Error(`Vocal separation failed (exit code ${exitCode}): ${keyError}`);
        Sentry.captureException(error, {
          extra: {
            exitCode,
            stderr_full: stderr,
            stdout_full: stdout,
            stderr_length: stderr.length,
            stdout_length: stdout.length,
          },
        });

        throw error;
      }

      // Step 4: Return vocals path (stem_0.wav)
      const vocalsPath = `${outputBase}_stem_0.wav`;
      if (!fs.existsSync(vocalsPath)) {
        const error = new Error(`Vocal separation output not found: ${vocalsPath}`);
        Sentry.captureException(error, {
          extra: { outputBase, exitCode, stdout, stderr },
        });
        throw error;
      }

      return { vocalsPath };
    } finally {
      // Cleanup input WAV
      if (inputWav && fs.existsSync(inputWav)) {
        fs.unlinkSync(inputWav);
      }
      // Cleanup accompaniment (stem_1.wav) if exists
      const accompPath = path.join(tempDir, `mbr_output_${timestamp}_stem_1.wav`);
      if (fs.existsSync(accompPath)) {
        fs.unlinkSync(accompPath);
      }
      await cleanupVideo();
      await cleanupModel();
    }
  }

  /**
   * Abort all active vocal separation processes.
   * Called via IPC when user cancels the operation.
   */
  abort(): void {
    console.log('[VocalSeparator] Aborting all active processes');
    this.activeProcesses.forEach((proc, id) => {
      console.log(`[VocalSeparator] Killing process ${id}`);
      proc.kill('SIGTERM');
    });
    this.activeProcesses.clear();
  }

  /**
   * Read vocals file as Buffer (for renderer to decode).
   */
  async readVocalsFile(filePath: string): Promise<Buffer> {
    // Security: only allow reading from temp directory
    if (!filePath.startsWith(os.tmpdir())) {
      throw new ExpectedError(t('vocalSeparator.accessDenied'));
    }
    return fs.promises.readFile(filePath);
  }
}

export const vocalSeparatorService = new VocalSeparator();
