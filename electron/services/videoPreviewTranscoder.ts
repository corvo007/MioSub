/**
 * Video Preview Transcoder Service
 *
 * Specialized transcoding for video preview with:
 * - Fragmented MP4 for progressive playback (边转码边播放)
 * - GPU acceleration priority
 * - 720p resolution for fast transcoding
 * - Ultrafast preset for minimal wait time
 */

import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { app } from 'electron';
import { VideoCompressorService } from './videoCompressor.ts';

// Supported formats that don't need transcoding
const SUPPORTED_FORMATS = ['mp4', 'webm', 'm4v'];

// Singleton compressor for GPU detection
let compressorInstance: VideoCompressorService | null = null;

// Track active FFmpeg commands for cleanup (filePath -> { command, outputPath })
const activeCommands: Map<string, { command: ReturnType<typeof ffmpeg>; outputPath: string }> =
  new Map();

// Track cancelled tasks to distinguish user cancellation from actual errors
const cancelledPaths: Set<string> = new Set();

function getCompressor(): VideoCompressorService {
  if (!compressorInstance) {
    compressorInstance = new VideoCompressorService();
  }
  return compressorInstance;
}

/**
 * Cancel a specific transcoding task
 */
export function cancelTranscode(filePath: string): boolean {
  const active = activeCommands.get(filePath);
  if (active) {
    try {
      // Mark as cancelled BEFORE killing to prevent CPU fallback
      cancelledPaths.add(filePath);

      active.command.kill('SIGKILL');

      // Cleanup partial file (with retry for file locks)
      const outputPath = active.outputPath;
      setTimeout(() => {
        if (fs.existsSync(outputPath)) {
          try {
            fs.unlinkSync(outputPath);
            console.log(`[PreviewTranscoder] Deleted partial file: ${outputPath}`);
          } catch (e) {
            console.error(`[PreviewTranscoder] Failed to delete partial file ${outputPath}:`, e);
          }
        }
      }, 500); // Wait 500ms for process to release lock

      activeCommands.delete(filePath);
      console.log(`[PreviewTranscoder] Cancelled transcoding for: ${filePath}`);
      return true;
    } catch (e) {
      console.error(`[PreviewTranscoder] Failed to cancel transcoding for ${filePath}:`, e);
    }
  }
  return false;
}

/**
 * Kill all active FFmpeg transcoding processes.
 * Call this when the app is quitting to prevent orphaned processes.
 */
// Keep only one implementation of killAllTranscodes
export function killAllTranscodes(): void {
  for (const [_filePath, active] of activeCommands.entries()) {
    try {
      active.command.kill('SIGKILL');

      // Attempt cleanup
      try {
        if (fs.existsSync(active.outputPath)) {
          fs.unlinkSync(active.outputPath);
        }
      } catch {
        // Ignore cleanup errors during shutdown
      }
    } catch {
      // Ignore errors if process already exited
    }
  }
  activeCommands.clear();
}

// Get temp directory for preview files
function getPreviewTempDir(): string {
  const tempDir = path.join(app.getPath('temp'), 'gemini-subtitle-pro', 'preview');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  return tempDir;
}

/**
 * Generate a cache key based on file path and modification time
 */
function getCacheKey(filePath: string): string {
  try {
    const stats = fs.statSync(filePath);
    const data = `${filePath}|${stats.mtimeMs}|${stats.size}`;
    return crypto.createHash('md5').update(data).digest('hex');
  } catch {
    return crypto.createHash('md5').update(filePath).digest('hex');
  }
}

/**
 * Get cached preview file path if it exists
 */
function getCachedPreviewPath(filePath: string): string | null {
  const tempDir = getPreviewTempDir();
  const cacheKey = getCacheKey(filePath);
  const cachedPath = path.join(tempDir, `cache_${cacheKey}.mp4`);

  if (fs.existsSync(cachedPath)) {
    // Verify file is not empty
    const stats = fs.statSync(cachedPath);
    if (stats.size > 1000) {
      // At least 1KB
      return cachedPath;
    }
  }
  return null;
}

/**
 * Get cache output path for a source file
 */
function getCacheOutputPath(filePath: string): string {
  const tempDir = getPreviewTempDir();
  const cacheKey = getCacheKey(filePath);
  return path.join(tempDir, `cache_${cacheKey}.mp4`);
}

/**
 * Get total size of preview cache in bytes
 */
export function getCacheSize(): { size: number; fileCount: number } {
  const tempDir = getPreviewTempDir();
  let totalSize = 0;
  let fileCount = 0;

  try {
    const files = fs.readdirSync(tempDir);
    for (const file of files) {
      if (file.endsWith('.mp4')) {
        const filePath = path.join(tempDir, file);
        const stats = fs.statSync(filePath);
        totalSize += stats.size;
        fileCount++;
      }
    }
  } catch (error) {
    console.error('[PreviewTranscoder] getCacheSize error:', error);
  }

  return { size: totalSize, fileCount };
}

/**
 * Clear all preview cache files
 */
export function clearCache(): { cleared: number; freedBytes: number } {
  const tempDir = getPreviewTempDir();
  let cleared = 0;
  let freedBytes = 0;

  try {
    const files = fs.readdirSync(tempDir);
    for (const file of files) {
      if (file.endsWith('.mp4')) {
        const filePath = path.join(tempDir, file);
        try {
          const stats = fs.statSync(filePath);
          freedBytes += stats.size;
          fs.unlinkSync(filePath);
          cleared++;
          console.log(`[PreviewTranscoder] Cleared: ${file}`);
        } catch (e) {
          console.error(`[PreviewTranscoder] Failed to delete ${file}:`, e);
        }
      }
    }
  } catch (error) {
    console.error('[PreviewTranscoder] clearCache error:', error);
  }

  return { cleared, freedBytes };
}

// Cache size limit: 3GB
const CACHE_LIMIT_BYTES = 3 * 1024 * 1024 * 1024;

/**
 * Enforce cache size limit by removing oldest files when limit is exceeded.
 * Called on app startup.
 */
export function enforceCacheLimit(): { cleared: number; freedBytes: number } {
  const tempDir = getPreviewTempDir();
  let cleared = 0;
  let freedBytes = 0;

  try {
    // Get all cache files with their stats
    const files = fs.readdirSync(tempDir);
    const fileInfos: { name: string; path: string; size: number; mtime: number }[] = [];
    let totalSize = 0;

    for (const file of files) {
      if (file.endsWith('.mp4')) {
        const filePath = path.join(tempDir, file);
        try {
          const stats = fs.statSync(filePath);
          fileInfos.push({
            name: file,
            path: filePath,
            size: stats.size,
            mtime: stats.mtimeMs,
          });
          totalSize += stats.size;
        } catch {
          // Skip files that can't be read
        }
      }
    }

    // If under limit, nothing to do
    if (totalSize <= CACHE_LIMIT_BYTES) {
      console.log(
        `[PreviewTranscoder] Cache size: ${(totalSize / 1024 / 1024).toFixed(1)} MB (under ${CACHE_LIMIT_BYTES / 1024 / 1024 / 1024} GB limit)`
      );
      return { cleared: 0, freedBytes: 0 };
    }

    console.log(
      `[PreviewTranscoder] Cache size ${(totalSize / 1024 / 1024).toFixed(1)} MB exceeds limit, cleaning oldest files...`
    );

    // Sort by modification time (oldest first)
    fileInfos.sort((a, b) => a.mtime - b.mtime);

    // Delete oldest files until under limit
    for (const fileInfo of fileInfos) {
      if (totalSize <= CACHE_LIMIT_BYTES) break;

      try {
        fs.unlinkSync(fileInfo.path);
        totalSize -= fileInfo.size;
        freedBytes += fileInfo.size;
        cleared++;
        console.log(`[PreviewTranscoder] Removed old cache: ${fileInfo.name}`);
      } catch (e) {
        console.error(`[PreviewTranscoder] Failed to delete ${fileInfo.name}:`, e);
      }
    }

    console.log(
      `[PreviewTranscoder] Cleaned ${cleared} files, freed ${(freedBytes / 1024 / 1024).toFixed(1)} MB`
    );
  } catch (error) {
    console.error('[PreviewTranscoder] enforceCacheLimit error:', error);
  }

  return { cleared, freedBytes };
}

export interface TranscodeForPreviewOptions {
  filePath: string;
  onProgress?: (percent: number, transcodedDuration?: number) => void;
  onStart?: (outputPath: string, duration: number) => void;
  onLog?: (message: string) => void;
}

export interface TranscodeForPreviewResult {
  outputPath: string;
  duration: number;
}

/**
 * Check if a file needs transcoding based on its extension
 */
export function needsTranscode(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase().slice(1);
  return !SUPPORTED_FORMATS.includes(ext);
}

/**
 * Transcode a video file for preview playback
 * Uses fragmented MP4 for progressive streaming (边转码边播放)
 */
export async function transcodeForPreview(
  options: TranscodeForPreviewOptions
): Promise<TranscodeForPreviewResult> {
  const { filePath, onProgress, onStart, onLog } = options;

  const log = (msg: string) => {
    console.log(`[PreviewTranscoder] ${msg}`);
    onLog?.(msg);
  };

  // Validate input
  if (!fs.existsSync(filePath)) {
    throw new Error(`Input file does not exist: ${filePath}`);
  }

  // Check cache first
  const cachedPath = getCachedPreviewPath(filePath);
  if (cachedPath) {
    log(`Cache hit: ${cachedPath}`);
    const duration = await getVideoDuration(filePath);
    // Notify start immediately since we have the file
    onStart?.(cachedPath, duration);
    onProgress?.(100, duration);
    return { outputPath: cachedPath, duration };
  }

  // Generate output path with cache key
  const outputPath = getCacheOutputPath(filePath);

  log(`Input: ${filePath}`);
  log(`Output: ${outputPath}`);

  // Detect GPU encoder
  const compressor = getCompressor();
  const hwInfo = await compressor.detectHardwareAccel();
  const encoder = hwInfo.preferredH264;
  const isGpuEncoder = !encoder.startsWith('lib');

  log(`Using encoder: ${encoder} (GPU: ${isGpuEncoder})`);

  // Get video duration first
  const duration = await getVideoDuration(filePath);
  log(`Video duration: ${duration}s`);

  // Detect streams to check if video exists
  const hasVideoStream = await new Promise<boolean>((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        resolve(true); // Assume video on error to be safe
        return;
      }
      const videoStream = metadata.streams.find((s) => s.codec_type === 'video');
      resolve(!!videoStream);
    });
  });

  log(`Has video stream: ${hasVideoStream}`);

  return new Promise((resolve, reject) => {
    let command = ffmpeg(filePath).output(outputPath);

    if (hasVideoStream) {
      // Video transcoding logic
      command.videoCodec(encoder).outputOptions([
        // 720p scaling + Force 8-bit pixel format (CRITICAL for NVENC compatibility)
        '-vf',
        'scale=-2:720,format=yuv420p',
        // Force keyframe interval for seeking (1 second)
        '-g',
        '30',
        '-keyint_min',
        '30',
        // Fragmented MP4 for progressive playback
        // frag_duration ensures both audio and video are fragmented at 1-second intervals
        // This prevents Chromium from loading entire audio track into memory
        '-movflags',
        'frag_keyframe+empty_moov+default_base_moof',
        '-frag_duration',
        '1000000', // 1 second in microseconds
      ]);

      // Audio settings optimized for streaming:
      // - Force 48kHz sample rate to avoid Chromium resampling (which loads entire track)
      // - AAC codec for broad compatibility
      // - Low bitrate for preview (75k is sufficient for speech/music preview)
      command.audioCodec('aac').audioBitrate('75k').audioFrequency(48000); // Force 48kHz to avoid Chromium resampling
    } else {
      // Audio-only transcoding logic (just convert to AAC/M4A compatible container)
      log('Audio-only input detected, skipping video encoding...');
      command
        .noVideo()
        .audioCodec('aac')
        .audioBitrate('128k') // Higher quality for audio-only
        .audioFrequency(48000) // Force 48kHz to avoid Chromium resampling
        .outputOptions([
          // Fragmented MP4 for consistency with player and progressive loading
          '-movflags',
          'frag_keyframe+empty_moov+default_base_moof',
          '-frag_duration',
          '1000000', // 1 second fragments for streaming
        ]);
    }

    // Apply encoder-specific settings only if processing video
    if (hasVideoStream) {
      if (encoder.includes('nvenc')) {
        // NVIDIA - fastest preset, constrained bitrate
        command.outputOptions([
          '-preset',
          'p1',
          '-rc',
          'vbr',
          '-b:v',
          '750k',
          '-maxrate',
          '900k',
          '-bufsize',
          '1800k',
        ]);
      } else if (encoder.includes('qsv')) {
        // Intel - fastest preset
        command.outputOptions([
          '-preset',
          'veryfast',
          '-b:v',
          '750k',
          '-maxrate',
          '900k',
          '-bufsize',
          '1800k',
        ]);
      } else if (encoder.includes('amf')) {
        // AMD - fastest quality setting
        command.outputOptions([
          '-quality',
          'speed',
          '-rc',
          'vbr_peak',
          '-b:v',
          '750k',
          '-maxrate',
          '900k',
          '-bufsize',
          '1800k',
        ]);
      } else {
        // CPU fallback - ultrafast for speed, constrained bitrate
        command.outputOptions([
          '-preset',
          'ultrafast',
          '-b:v',
          '750k',
          '-maxrate',
          '900k',
          '-bufsize',
          '1800k',
        ]);
      }
    }

    command
      .on('start', (cmdLine) => {
        log(`FFmpeg command: ${cmdLine}`);

        // Wait for file to have content before notifying frontend
        // This prevents the player from receiving a 0-byte response and failing
        const checkInterval = setInterval(() => {
          try {
            if (fs.existsSync(outputPath)) {
              const stats = fs.statSync(outputPath);
              if (stats.size > 0) {
                clearInterval(checkInterval);
                log(`File started writing (size: ${stats.size}), notifying frontend`);
                onStart?.(outputPath, duration);
              }
            }
          } catch (e) {
            const err = e instanceof Error ? e.message : String(e);
            log(`[CheckInterval] Preview transcode file check error: ${err}`);
          }
        }, 100);

        // Safety timeout: if no data after 5s, notify anyway (or maybe fail?)
        // Let's rely on progress/error events to handle failure, just clear interval on end/error
        command.once('end', () => clearInterval(checkInterval));
        command.once('error', () => clearInterval(checkInterval));
      })
      .on('progress', (progress) => {
        const percent = Math.round(progress.percent || 0);
        // Estimate transcoded duration based on progress
        const transcodedDur = duration > 0 ? (percent / 100) * duration : undefined;
        onProgress?.(percent, transcodedDur);
      })
      .on('end', () => {
        activeCommands.delete(filePath);
        log(`Transcode completed: ${outputPath}`);
        resolve({ outputPath, duration });
      })
      .on('error', (err, stdout, stderr) => {
        activeCommands.delete(filePath);

        // Check if this was a user cancellation
        if (cancelledPaths.has(filePath)) {
          cancelledPaths.delete(filePath);
          log(`Transcode cancelled by user`);
          reject(new Error('Transcode cancelled by user'));
          return;
        }

        log(`Transcode error: ${err.message}`);
        log(`stderr: ${stderr}`);

        // If GPU encoding failed, try CPU fallback
        if (isGpuEncoder) {
          log('GPU encoding failed, falling back to CPU (libx264)...');
          transcodeWithCpu(filePath, outputPath, duration, onProgress, onStart, log)
            .then((result) => resolve(result))
            .catch((cpuErr) => reject(cpuErr));
        } else {
          reject(err);
        }
      })
      .run();

    // Track this command for cleanup on app quit
    activeCommands.set(filePath, { command, outputPath });
  });
}

/**
 * CPU fallback transcoding
 */
async function transcodeWithCpu(
  inputPath: string,
  outputPath: string,
  duration: number,
  onProgress?: (percent: number, transcodedDuration?: number) => void,
  onStart?: (outputPath: string, duration: number) => void,
  log?: (message: string) => void
): Promise<TranscodeForPreviewResult> {
  return new Promise((resolve, reject) => {
    const command = ffmpeg(inputPath)
      .output(outputPath)
      .videoCodec('libx264')
      .outputOptions([
        '-vf',
        'scale=-2:720,format=yuv420p',
        '-preset',
        'ultrafast',
        '-crf',
        '28',
        '-g',
        '30',
        '-keyint_min',
        '30',
        // Fragmented MP4 with 1-second fragments for streaming
        '-movflags',
        'frag_keyframe+empty_moov+default_base_moof',
        '-frag_duration',
        '1000000',
      ])
      // Audio settings optimized for streaming
      .audioCodec('aac')
      .audioBitrate('128k')
      .audioFrequency(48000); // Force 48kHz to avoid Chromium resampling

    command
      .on('start', (cmdLine) => {
        log?.(`CPU FFmpeg command: ${cmdLine}`);

        const checkInterval = setInterval(() => {
          try {
            if (fs.existsSync(outputPath)) {
              const stats = fs.statSync(outputPath);
              if (stats.size > 0) {
                clearInterval(checkInterval);
                onStart?.(outputPath, duration);
              }
            }
          } catch (e) {
            log?.(
              `[CheckInterval] CPU transcode file check error: ${e instanceof Error ? e.message : String(e)}`
            );
          }
        }, 100);

        // Clear interval on completion or error
        command.once('end', () => clearInterval(checkInterval));
        command.once('error', () => clearInterval(checkInterval));
      })
      .on('progress', (progress) => {
        const percent = Math.round(progress.percent || 0);
        const transcodedDur = duration > 0 ? (percent / 100) * duration : undefined;
        onProgress?.(percent, transcodedDur);
      })
      .on('end', () => {
        activeCommands.delete(inputPath);
        log?.('CPU transcode completed');
        resolve({ outputPath, duration });
      })
      .on('error', (err) => {
        activeCommands.delete(inputPath);

        // Check if this was a user cancellation
        if (cancelledPaths.has(inputPath)) {
          cancelledPaths.delete(inputPath);
          log?.(`CPU transcode cancelled by user`);
          reject(new Error('Transcode cancelled by user'));
          return;
        }

        log?.(`CPU transcode error: ${err.message}`);
        reject(err);
      })
      .run();

    // Track this command for cleanup on app quit
    activeCommands.set(inputPath, { command, outputPath });
  });
}

/**
 * Get video duration using ffprobe
 */
async function getVideoDuration(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        console.error('[PreviewTranscoder] ffprobe error:', err);
        resolve(0); // Return 0 if probe fails
        return;
      }
      resolve(metadata.format.duration || 0);
    });
  });
}
