import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { spawn, type ChildProcess } from 'child_process';
import * as Sentry from '@sentry/electron/main';
import { t } from '../i18n.ts';
import { getBinaryPath } from '../utils/paths.ts';
import { buildSpawnArgs, ensureAsciiSafePath } from '../utils/shell.ts';
import { ExpectedError } from '../utils/expectedError.ts';
import { extractAudioFromVideo, cleanupTempAudio } from './ffmpegAudioExtractor.ts';

const VIDEO_EXTENSIONS = new Set([
  '.mp4',
  '.mkv',
  '.avi',
  '.mov',
  '.webm',
  '.flv',
  '.m4v',
  '.ts',
  '.wmv',
  '.mpg',
  '.mpeg',
]);

export interface NativeVadOptions {
  threshold?: number; // default 0.5
  minSpeechDurationMs?: number; // default 250
  minSilenceDurationMs?: number; // default 100
  speechPadMs?: number; // default 30
}

export interface VadSegment {
  start: number;
  end: number;
}

export class NativeVadService {
  private activeProcesses: Map<string, ChildProcess> = new Map();
  private processSeq = 0;

  /**
   * Get the path to the whisper-vad-speech-segments binary.
   */
  private getBinaryPathInternal(): string {
    const binaryName =
      process.platform === 'win32'
        ? 'whisper-vad-speech-segments.exe'
        : 'whisper-vad-speech-segments';
    return getBinaryPath(binaryName);
  }

  /**
   * Get the path to the VAD model (ggml-silero-v6.2.0.bin).
   */
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
        console.log(`[NativeVad] Found VAD model at: ${p}`);
        return p;
      }
    }

    console.warn(`[NativeVad] VAD model not found. Searched at: ${possiblePaths.join(', ')}`);
    Sentry.captureMessage('VAD model not found', {
      level: 'warning',
      extra: { searchedPaths: possiblePaths },
    });
    return null;
  }

  /**
   * Analyze audio file and return speech segments.
   * Accepts video or audio file paths (auto-detects and extracts audio if needed).
   *
   * @param filePath - Path to audio or video file
   * @param options - VAD configuration options
   * @param signal - AbortSignal for cancellation
   * @returns Array of speech segments with start/end times in seconds
   */
  public async analyzeAudio(
    filePath: string,
    options: NativeVadOptions = {},
    signal?: AbortSignal
  ): Promise<VadSegment[]> {
    const binaryPath = this.getBinaryPathInternal();
    if (!binaryPath || !fs.existsSync(binaryPath)) {
      throw new ExpectedError(t('nativeVad.binaryNotFound'));
    }

    const modelPath = this.getVadModelPath();
    if (!modelPath) {
      throw new ExpectedError(t('nativeVad.modelNotFound'));
    }

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      throw new ExpectedError(t('nativeVad.fileNotFound', { path: filePath }));
    }

    // Extract audio from video files — binary only accepts audio formats (wav/mp3/flac/ogg)
    let audioFilePath = filePath;
    let extractedAudioPath: string | null = null;
    if (VIDEO_EXTENSIONS.has(path.extname(filePath).toLowerCase())) {
      console.log(
        `[NativeVad] Video file detected, extracting audio for VAD: ${path.basename(filePath)}`
      );
      extractedAudioPath = await extractAudioFromVideo(filePath, {
        format: 'wav',
        channels: 1,
        sampleRate: 16000,
      });
      audioFilePath = extractedAudioPath;
    }

    // Ensure ASCII-safe paths for Windows
    const { safePath: safeFilePath, cleanup: cleanupFile } =
      await ensureAsciiSafePath(audioFilePath);
    const { safePath: safeModelPath, cleanup: cleanupModel } = await ensureAsciiSafePath(modelPath);

    try {
      // Build command arguments
      const args: string[] = ['-vm', safeModelPath, '-f', safeFilePath];

      // Add optional parameters
      if (options.threshold !== undefined) {
        args.push('-vt', options.threshold.toString());
      }
      if (options.minSpeechDurationMs !== undefined) {
        args.push('-vspd', options.minSpeechDurationMs.toString());
      }
      if (options.minSilenceDurationMs !== undefined) {
        args.push('-vsd', options.minSilenceDurationMs.toString());
      }
      if (options.speechPadMs !== undefined) {
        args.push('-vp', options.speechPadMs.toString());
      }

      console.log(`[NativeVad] Running VAD analysis: ${binaryPath} ${args.join(' ')}`);

      // Spawn the process
      const { command, args: spawnArgs, options: spawnOptions } = buildSpawnArgs(binaryPath, args);
      const proc = spawn(command, spawnArgs, {
        ...spawnOptions,
        windowsHide: true,
      });

      const processId = `vad-${Date.now()}-${++this.processSeq}`;
      this.activeProcesses.set(processId, proc);

      // Handle abort signal
      const onAbort = () => {
        console.log(`[NativeVad] Aborting VAD analysis (process ${processId})`);
        proc.kill('SIGTERM');
        this.activeProcesses.delete(processId);
      };

      if (signal) {
        if (signal.aborted) {
          onAbort();
          throw new Error(t('services:pipeline.errors.cancelled'));
        }
        signal.addEventListener('abort', onAbort);
      }

      // Collect stdout and stderr
      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      // Wait for process to complete
      const { code, signal: exitSignal } = await new Promise<{
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

      // Check if process was killed (abort) — code is null for signals
      if (exitSignal || signal?.aborted) {
        throw new ExpectedError(t('services:pipeline.errors.cancelled'));
      }

      if (code !== 0) {
        console.error(`[NativeVad] Process exited with code ${code}`);
        console.error(`[NativeVad] stderr: ${stderr}`);
        // Process failure should be reported to Sentry
        throw new Error(`VAD process failed (exit code ${code}): ${stderr}`);
      }

      // Parse output
      const segments = this.parseVadOutput(stdout);
      console.log(`[NativeVad] Found ${segments.length} speech segments`);

      return segments;
    } finally {
      // Cleanup ASCII-safe paths
      await cleanupFile();
      await cleanupModel();
      // Cleanup extracted audio temp file (only if we created one)
      if (extractedAudioPath) {
        await cleanupTempAudio(extractedAudioPath).catch(() => {});
      }
    }
  }

  /**
   * Parse vad-speech-segments output.
   * Expected format: lines like "00:00:01.234 --> 00:00:05.678"
   */
  private parseVadOutput(output: string): VadSegment[] {
    const segments: VadSegment[] = [];
    const lines = output.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.includes('-->')) continue;

      // Parse timestamp format: HH:MM:SS.mmm --> HH:MM:SS.mmm
      const match = trimmed.match(
        /(\d{2}):(\d{2}):(\d{2}\.\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}\.\d{3})/
      );
      if (!match) continue;

      const startHours = parseInt(match[1], 10);
      const startMinutes = parseInt(match[2], 10);
      const startSeconds = parseFloat(match[3]);
      const endHours = parseInt(match[4], 10);
      const endMinutes = parseInt(match[5], 10);
      const endSeconds = parseFloat(match[6]);

      const start = startHours * 3600 + startMinutes * 60 + startSeconds;
      const end = endHours * 3600 + endMinutes * 60 + endSeconds;

      segments.push({ start, end });
    }

    return segments;
  }

  /**
   * Abort all active VAD processes.
   */
  public abort(): void {
    this.activeProcesses.forEach((proc, id) => {
      console.log(`[NativeVad] Killing process ${id}`);
      proc.kill('SIGTERM');
    });
    this.activeProcesses.clear();
  }
}
