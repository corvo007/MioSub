import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { app } from 'electron';

import { getBinaryPath } from '../utils/paths.ts';

const checkBinaryExistence = (name: string, pathStr: string) => {
  if (!app.isPackaged && !fs.existsSync(pathStr)) {
    console.warn(
      `[FFmpeg] Binary not found at ${pathStr}. Please run 'yarn postinstall' or manually copy binaries to resources/`
    );
  }
};

// 设置 FFmpeg 路径
const ffmpegPath = getBinaryPath('ffmpeg');
checkBinaryExistence('ffmpeg', ffmpegPath);

// Log the ffmpeg path for debugging
console.log('[FFmpeg] Initializing with path:', ffmpegPath);

ffmpeg.setFfmpegPath(ffmpegPath);

const ffprobePath = getBinaryPath('ffprobe');
checkBinaryExistence('ffprobe', ffprobePath);
ffmpeg.setFfprobePath(ffprobePath);

// 导出获取函数供其他模块使用（如日志）
export const getFFmpegPath = () => getBinaryPath('ffmpeg');
export const getFFprobePath = () => getBinaryPath('ffprobe');

// Track active audio extraction commands for cleanup on app quit
const activeAudioCommands: Set<ReturnType<typeof ffmpeg>> = new Set();

// Track current audio extraction for cancellation support
let currentAudioCommand: {
  command: ReturnType<typeof ffmpeg>;
  outputPath: string;
} | null = null;
let isAudioExtractionCancelled = false;

/**
 * Kill all active audio extraction processes.
 * Call this when the app is quitting to prevent orphaned processes.
 */
export function killAllAudioExtractions(): void {
  for (const command of activeAudioCommands) {
    try {
      command.kill('SIGKILL');
    } catch (_e) {
      // Ignore errors if process already exited
    }
  }
  activeAudioCommands.clear();
}

/**
 * Cancel the current audio extraction operation.
 * Returns true if cancellation was successful, false if no extraction was running.
 */
export function cancelAudioExtraction(): boolean {
  if (currentAudioCommand) {
    try {
      isAudioExtractionCancelled = true;
      currentAudioCommand.command.kill('SIGKILL');
      const outputPath = currentAudioCommand.outputPath;
      // Delay cleanup to allow process to release file handle
      setTimeout(() => {
        if (fs.existsSync(outputPath)) {
          try {
            fs.unlinkSync(outputPath);
          } catch (_e) {
            // Ignore cleanup errors
          }
        }
      }, 500);
      activeAudioCommands.delete(currentAudioCommand.command);
      currentAudioCommand = null;
      return true;
    } catch (_e) {
      return false;
    }
  }
  return false;
}

export interface AudioExtractionOptions {
  format?: 'wav' | 'mp3' | 'flac';
  sampleRate?: number;
  channels?: number;
  bitrate?: string;
  customFfmpegPath?: string;
  customFfprobePath?: string;
}

export interface AudioSegmentOptions extends AudioExtractionOptions {
  startTime: number; // Start time in seconds
  duration: number; // Duration in seconds
}

export interface AudioExtractionProgress {
  percent: number;
  currentTime: string;
  targetSize: string;
}

/**
 * 从视频文件提取音频
 */
export async function extractAudioFromVideo(
  videoPath: string,
  options: AudioExtractionOptions = {},
  onProgress?: (progress: AudioExtractionProgress) => void,
  onLog?: (message: string) => void
): Promise<string> {
  const {
    format = 'wav',
    sampleRate = 16000,
    channels = 1,
    bitrate = '128k',
    customFfmpegPath,
    customFfprobePath,
  } = options;

  // Set custom FFprobe path if provided
  if (customFfprobePath) {
    if (fs.existsSync(customFfprobePath)) {
      if (onLog) onLog(`[DEBUG] Using Custom FFprobe Path: ${customFfprobePath}`);
      ffmpeg.setFfprobePath(customFfprobePath);
    } else {
      if (onLog)
        onLog(`[WARN] Custom FFprobe Path not found: ${customFfprobePath}, using default.`);
    }
  }

  // 如果提供了自定义路径，则设置
  if (customFfmpegPath) {
    if (fs.existsSync(customFfmpegPath)) {
      if (onLog) onLog(`[DEBUG] Using Custom FFmpeg Path: ${customFfmpegPath}`);
      ffmpeg.setFfmpegPath(customFfmpegPath);
    } else {
      if (onLog) onLog(`[WARN] Custom FFmpeg Path not found: ${customFfmpegPath}, using default.`);
    }
  }

  // 创建临时输出文件路径
  const tempDir = os.tmpdir();
  const outputFileName = `audio_${Date.now()}.${format}`;
  const outputPath = path.join(tempDir, outputFileName);

  return new Promise((resolve, reject) => {
    // Reset cancellation flag at start
    isAudioExtractionCancelled = false;

    let command = ffmpeg(videoPath)
      .outputOptions([
        `-ar ${sampleRate}`, // 采样率
        `-ac ${channels}`, // 声道数
      ])
      .output(outputPath);

    // 根据格式设置比特率
    if (format === 'mp3') {
      command = command.audioBitrate(bitrate);
    }

    // Log FFmpeg path and command
    if (onLog) {
      onLog(`[DEBUG] FFmpeg Path: ${getFFmpegPath()}`);
      onLog(`[DEBUG] FFmpeg Probe Path: ${getFFprobePath()}`);
    }

    // 监听日志
    if (onLog) {
      command.on('start', (commandLine) => {
        onLog(`[DEBUG] FFmpeg Start: ${commandLine}`);
      });
      command.on('stderr', (stderrLine) => {
        const lowerLine = stderrLine.toLowerCase();
        if (
          lowerLine.includes('error') ||
          lowerLine.includes('exception') ||
          lowerLine.includes('failed') ||
          lowerLine.includes('warning') ||
          lowerLine.includes('fatal') ||
          lowerLine.includes('panic')
        ) {
          onLog(`[WARN] [FFmpeg] ${stderrLine}`);
        }
      });
    }

    // 监听进度
    if (onProgress) {
      command.on('progress', (progress) => {
        onProgress({
          percent: progress.percent || 0,
          currentTime: progress.timemark || '00:00:00',
          targetSize: progress.targetSize ? `${progress.targetSize}KB` : 'Unknown',
        });
      });
    }

    // 监听完成
    command.on('end', () => {
      activeAudioCommands.delete(command);
      currentAudioCommand = null;
      resolve(outputPath);
    });

    // 监听错误
    command.on('error', (err) => {
      activeAudioCommands.delete(command);
      currentAudioCommand = null;
      // Check if this was a cancellation
      if (isAudioExtractionCancelled) {
        reject(new Error('Audio extraction cancelled'));
        return;
      }
      // 清理可能生成的临时文件
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }
      reject(new Error(`FFmpeg extraction failed: ${err.message}`));
    });

    // 开始处理
    command.run();

    // Track this command for cleanup on app quit
    activeAudioCommands.add(command);
    // Track as current command for cancellation
    currentAudioCommand = { command, outputPath };
  });
}

/**
 * 读取提取的音频文件为 Buffer
 */
export async function readAudioBuffer(audioPath: string): Promise<Buffer> {
  return await fs.promises.readFile(audioPath);
}

/**
 * 清理临时音频文件
 */
export async function cleanupTempAudio(audioPath: string): Promise<void> {
  try {
    if (fs.existsSync(audioPath)) {
      await fs.promises.unlink(audioPath);
    }
  } catch (err) {
    console.warn('Failed to cleanup temp audio:', err);
  }
}

/**
 * 从视频文件提取指定时间段的音频（用于长视频按需分段提取）
 * Uses -ss before input for fast seeking
 */
export async function extractAudioSegment(
  videoPath: string,
  options: AudioSegmentOptions,
  onProgress?: (progress: AudioExtractionProgress) => void,
  onLog?: (message: string) => void
): Promise<string> {
  const {
    format = 'wav',
    sampleRate = 16000,
    channels = 1,
    bitrate = '128k',
    startTime,
    duration,
    customFfmpegPath,
    customFfprobePath,
  } = options;

  // Set custom FFprobe path if provided
  if (customFfprobePath) {
    if (fs.existsSync(customFfprobePath)) {
      if (onLog) onLog(`[DEBUG] Using Custom FFprobe Path: ${customFfprobePath}`);
      ffmpeg.setFfprobePath(customFfprobePath);
    } else {
      if (onLog)
        onLog(`[WARN] Custom FFprobe Path not found: ${customFfprobePath}, using default.`);
    }
  }

  // Set custom FFmpeg path if provided
  if (customFfmpegPath) {
    if (fs.existsSync(customFfmpegPath)) {
      if (onLog) onLog(`[DEBUG] Using Custom FFmpeg Path: ${customFfmpegPath}`);
      ffmpeg.setFfmpegPath(customFfmpegPath);
    } else {
      if (onLog) onLog(`[WARN] Custom FFmpeg Path not found: ${customFfmpegPath}, using default.`);
    }
  }

  // Create temp output file path
  const tempDir = os.tmpdir();
  const outputFileName = `audio_segment_${Date.now()}_${startTime.toFixed(0)}.${format}`;
  const outputPath = path.join(tempDir, outputFileName);

  return new Promise((resolve, reject) => {
    // Reset cancellation flag at start
    isAudioExtractionCancelled = false;

    // Use -ss before -i for fast seeking (input seeking)
    let command = ffmpeg(videoPath)
      .inputOptions([`-ss ${startTime}`]) // Seek to start time before reading input
      .outputOptions([
        `-t ${duration}`, // Duration to extract
        `-ar ${sampleRate}`, // Sample rate
        `-ac ${channels}`, // Channels
      ])
      .output(outputPath);

    // Set bitrate for mp3 format
    if (format === 'mp3') {
      command = command.audioBitrate(bitrate);
    }

    // Log FFmpeg path and command
    if (onLog) {
      onLog(`[DEBUG] FFmpeg Path: ${getFFmpegPath()}`);
      onLog(`[DEBUG] Extracting segment: start=${startTime}s, duration=${duration}s`);
    }

    // Listen for logs
    if (onLog) {
      command.on('start', (commandLine) => {
        onLog(`[DEBUG] FFmpeg Start: ${commandLine}`);
      });
      command.on('stderr', (stderrLine) => {
        const lowerLine = stderrLine.toLowerCase();
        if (
          lowerLine.includes('error') ||
          lowerLine.includes('exception') ||
          lowerLine.includes('failed') ||
          lowerLine.includes('warning') ||
          lowerLine.includes('fatal') ||
          lowerLine.includes('panic')
        ) {
          onLog(`[WARN] [FFmpeg] ${stderrLine}`);
        }
      });
    }

    // Listen for progress
    if (onProgress) {
      command.on('progress', (progress) => {
        onProgress({
          percent: progress.percent || 0,
          currentTime: progress.timemark || '00:00:00',
          targetSize: progress.targetSize ? `${progress.targetSize}KB` : 'Unknown',
        });
      });
    }

    // Listen for completion
    command.on('end', () => {
      activeAudioCommands.delete(command);
      currentAudioCommand = null;
      resolve(outputPath);
    });

    // Listen for errors
    command.on('error', (err) => {
      activeAudioCommands.delete(command);
      currentAudioCommand = null;
      // Check if this was a cancellation
      if (isAudioExtractionCancelled) {
        reject(new Error('Audio extraction cancelled'));
        return;
      }
      // Clean up temp file if it was created
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }
      reject(new Error(`FFmpeg segment extraction failed: ${err.message}`));
    });

    // Start processing
    command.run();

    // Track this command for cleanup on app quit
    activeAudioCommands.add(command);
    // Track as current command for cancellation
    currentAudioCommand = { command, outputPath };
  });
}

/**
 * 获取视频文件的音频信息
 */
export async function getAudioInfo(videoPath: string): Promise<{
  duration: number;
  codec: string;
  sampleRate: number;
  channels: number;
}> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        reject(err);
        return;
      }

      const audioStream = metadata.streams.find((s) => s.codec_type === 'audio');
      if (!audioStream) {
        reject(new Error('No audio stream found in video'));
        return;
      }

      resolve({
        duration: metadata.format.duration || 0,
        codec: audioStream.codec_name || 'unknown',
        sampleRate: audioStream.sample_rate || 0,
        channels: audioStream.channels || 0,
      });
    });
  });
}
