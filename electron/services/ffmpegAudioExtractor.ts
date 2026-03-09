import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import { app } from 'electron';

import { getBinaryPath } from '../utils/paths.ts';
import { ExpectedError } from '../utils/expectedError.ts';
import { ensureAsciiSafePath, getAsciiSafeTempPath } from '../utils/shell.ts';

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

// Track active audio extractions for cancellation support (supports concurrent extractions)
interface AudioExtractionJob {
  command: ReturnType<typeof ffmpeg>;
  outputPath: string;
  isCancelled: boolean;
}
const activeJobs = new Map<number, AudioExtractionJob>();
let jobCounter = 0;
let currentJobId: number | null = null;

function getLatestActiveJobId(excludeJobId?: number): number | null {
  let latestJobId: number | null = null;

  for (const [jobId, job] of activeJobs) {
    if (jobId === excludeJobId || job.isCancelled) {
      continue;
    }
    latestJobId = jobId;
  }

  return latestJobId;
}

function registerJob(jobId: number, job: AudioExtractionJob): void {
  activeJobs.set(jobId, job);
  currentJobId = jobId;
}

function unregisterJob(jobId: number): AudioExtractionJob | undefined {
  const job = activeJobs.get(jobId);
  activeJobs.delete(jobId);

  if (currentJobId === jobId) {
    currentJobId = getLatestActiveJobId(jobId);
  }

  return job;
}

function removeOutputFile(outputPath: string): void {
  if (fs.existsSync(outputPath)) {
    fs.unlinkSync(outputPath);
  }
}

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
  const targetJobId = currentJobId ?? getLatestActiveJobId();
  if (targetJobId === null) {
    return false;
  }

  const job = activeJobs.get(targetJobId);
  if (!job) {
    currentJobId = getLatestActiveJobId(targetJobId);
    return false;
  }

  try {
    job.isCancelled = true;
    currentJobId = getLatestActiveJobId(targetJobId);

    try {
      job.command.kill('SIGKILL');
    } catch (_e) {
      return false;
    }

    setTimeout(() => {
      try {
        removeOutputFile(job.outputPath);
      } catch (_e) {
        return;
      }
    }, 500);

    return true;
  } catch (_e) {
    return false;
  }
}

export interface AudioExtractionOptions {
  format?: 'wav' | 'mp3' | 'flac';
  sampleRate?: number;
  channels?: number;
  bitrate?: string;
  codec?: string; // Audio codec (e.g., 'pcm_s16le', 'pcm_f32le')
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
    codec,
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

  // Create ASCII-safe alias for the input video path (handles Japanese/Chinese paths on Windows,
  // where FFmpeg reports EILSEQ -42 when the path contains non-ASCII characters).
  const { safePath: safeVideoPath, cleanup: cleanupSafePath } =
    await ensureAsciiSafePath(videoPath);

  // Use ASCII-safe temp path for output (handles non-ASCII usernames in the temp dir).
  const outputPath = getAsciiSafeTempPath(`audio_${Date.now()}.${format}`);

  return new Promise((resolve, reject) => {
    const jobId = ++jobCounter;

    let command = ffmpeg(safeVideoPath)
      .outputOptions([
        `-ar ${sampleRate}`, // 采样率
        `-ac ${channels}`, // 声道数
      ])
      .output(outputPath);

    // Set audio codec if specified
    if (codec) {
      command = command.audioCodec(codec);
    }

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

    command.on('end', () => {
      activeAudioCommands.delete(command);
      unregisterJob(jobId);
      cleanupSafePath();
      resolve(outputPath);
    });

    command.on('error', (err) => {
      const job = unregisterJob(jobId);
      activeAudioCommands.delete(command);
      cleanupSafePath();
      if (job?.isCancelled) {
        reject(new ExpectedError('Audio extraction cancelled'));
        return;
      }
      removeOutputFile(outputPath);
      reject(new Error(`FFmpeg extraction failed: ${err.message}`));
    });

    command.run();

    activeAudioCommands.add(command);
    registerJob(jobId, { command, outputPath, isCancelled: false });
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

  // Create ASCII-safe alias for the input video path (handles Japanese/Chinese paths on Windows).
  const { safePath: safeVideoPath, cleanup: cleanupSafePath } =
    await ensureAsciiSafePath(videoPath);

  // Use ASCII-safe temp path for output (handles non-ASCII usernames in the temp dir).
  const outputPath = getAsciiSafeTempPath(
    `audio_segment_${Date.now()}_${startTime.toFixed(0)}.${format}`
  );

  return new Promise((resolve, reject) => {
    const jobId = ++jobCounter;

    // Use -ss before -i for fast seeking (input seeking)
    let command = ffmpeg(safeVideoPath)
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

    command.on('end', () => {
      activeAudioCommands.delete(command);
      unregisterJob(jobId);
      cleanupSafePath();
      resolve(outputPath);
    });

    command.on('error', (err) => {
      const job = unregisterJob(jobId);
      activeAudioCommands.delete(command);
      cleanupSafePath();
      if (job?.isCancelled) {
        reject(new ExpectedError('Audio extraction cancelled'));
        return;
      }
      removeOutputFile(outputPath);
      reject(new Error(`FFmpeg segment extraction failed: ${err.message}`));
    });

    command.run();

    activeAudioCommands.add(command);
    registerJob(jobId, { command, outputPath, isCancelled: false });
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

export interface AudioSegmentRange {
  startTime: number; // Start time in seconds
  duration: number; // Duration in seconds
}

/**
 * Extract multiple audio segments and concatenate them into a single file.
 * Uses FFmpeg's concat filter for efficient single-pass extraction.
 *
 * @param videoPath - Path to the video file
 * @param segments - Array of segments to extract (startTime, duration)
 * @param options - Audio extraction options
 * @returns Path to the concatenated audio file
 */
export async function extractMultipleAudioSegments(
  videoPath: string,
  segments: AudioSegmentRange[],
  options: AudioExtractionOptions = {},
  onLog?: (message: string) => void
): Promise<string> {
  if (segments.length === 0) {
    throw new Error('No segments provided for extraction');
  }

  // For single segment, use the simpler function
  if (segments.length === 1) {
    return extractAudioSegment(videoPath, {
      ...options,
      startTime: segments[0].startTime,
      duration: segments[0].duration,
    });
  }

  const { format = 'wav', sampleRate = 16000, channels = 1 } = options;

  // Create ASCII-safe alias for the input video path (handles Japanese/Chinese paths on Windows).
  const { safePath: safeVideoPath, cleanup: cleanupSafePath } =
    await ensureAsciiSafePath(videoPath);

  // Use ASCII-safe temp path for output (handles non-ASCII usernames in the temp dir).
  const outputPath = getAsciiSafeTempPath(`audio_concat_${Date.now()}.${format}`);

  return new Promise((resolve, reject) => {
    const jobId = ++jobCounter;

    const inputArgs: string[] = [];
    const filterInputs: string[] = [];

    segments.forEach((seg, i) => {
      inputArgs.push('-ss', String(seg.startTime), '-t', String(seg.duration), '-i', safeVideoPath);
      filterInputs.push(`[${i}:a]`);
    });

    const concatFilter = `${filterInputs.join('')}concat=n=${segments.length}:v=0:a=1[out]`;

    if (onLog) {
      onLog(`[DEBUG] Extracting ${segments.length} segments from ${videoPath}`);
      onLog(`[DEBUG] Concat filter: ${concatFilter}`);
    }

    const { spawn } = require('child_process');
    const ffmpegBin = getFFmpegPath();

    const args = [
      ...inputArgs,
      '-filter_complex',
      concatFilter,
      '-map',
      '[out]',
      '-ar',
      String(sampleRate),
      '-ac',
      String(channels),
      '-y',
      outputPath,
    ];

    if (onLog) {
      onLog(`[DEBUG] FFmpeg command: ${ffmpegBin} ${args.join(' ')}`);
    }

    const proc = spawn(ffmpegBin, args);

    const procWrapper = {
      kill: (signal: string) => {
        try {
          proc.kill(signal);
        } catch (_e) {
          return;
        }
      },
    } as ReturnType<typeof ffmpeg>;
    activeAudioCommands.add(procWrapper);
    registerJob(jobId, { command: procWrapper, outputPath, isCancelled: false });

    proc.stderr.on('data', (data: Buffer) => {
      const line = data.toString();
      if (onLog) {
        const lowerLine = line.toLowerCase();
        if (
          lowerLine.includes('error') ||
          lowerLine.includes('failed') ||
          lowerLine.includes('fatal')
        ) {
          onLog(`[WARN] [FFmpeg] ${line}`);
        }
      }
    });

    proc.on('close', (code: number) => {
      const job = unregisterJob(jobId);
      activeAudioCommands.delete(procWrapper);
      cleanupSafePath();

      if (job?.isCancelled) {
        removeOutputFile(outputPath);
        reject(new ExpectedError('Audio extraction cancelled'));
        return;
      }

      if (code === 0) {
        resolve(outputPath);
      } else {
        removeOutputFile(outputPath);
        reject(new Error(`FFmpeg concat extraction failed with code ${code}`));
      }
    });

    proc.on('error', (err: Error) => {
      unregisterJob(jobId);
      activeAudioCommands.delete(procWrapper);
      cleanupSafePath();
      removeOutputFile(outputPath);
      reject(new Error(`FFmpeg spawn error: ${err.message}`));
    });
  });
}
