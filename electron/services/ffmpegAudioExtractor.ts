import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from '@ffmpeg-installer/ffmpeg';
import ffprobePath from '@ffprobe-installer/ffprobe';
import path from 'path';
import os from 'os';
import fs from 'fs';

// 设置 FFmpeg 路径
const fixPathForAsar = (pathStr: string) => {
  return pathStr.replace('app.asar', 'app.asar.unpacked');
};

ffmpeg.setFfmpegPath(fixPathForAsar(ffmpegPath.path));
ffmpeg.setFfprobePath(fixPathForAsar(ffprobePath.path));

export interface AudioExtractionOptions {
  format?: 'wav' | 'mp3' | 'flac';
  sampleRate?: number;
  channels?: number;
  bitrate?: string;
  customFfmpegPath?: string;
  customFfprobePath?: string;
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
      if (onLog) onLog(`[INFO] Using Custom FFprobe Path: ${customFfprobePath}`);
      ffmpeg.setFfprobePath(customFfprobePath);
    } else {
      if (onLog)
        onLog(`[WARN] Custom FFprobe Path not found: ${customFfprobePath}, using default.`);
    }
  }

  // 如果提供了自定义路径，则设置
  if (customFfmpegPath) {
    if (fs.existsSync(customFfmpegPath)) {
      if (onLog) onLog(`[INFO] Using Custom FFmpeg Path: ${customFfmpegPath}`);
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
      onLog(`[INFO] FFmpeg Path: ${ffmpegPath.path}`);
      onLog(`[INFO] FFmpeg Probe Path: ${ffprobePath.path}`);
    }

    // 监听日志
    if (onLog) {
      command.on('start', (commandLine) => {
        onLog(`[INFO] FFmpeg Start: ${commandLine}`);
      });
      command.on('stderr', (stderrLine) => {
        onLog(`[DEBUG] FFmpeg: ${stderrLine}`);
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
      resolve(outputPath);
    });

    // 监听错误
    command.on('error', (err) => {
      // 清理可能生成的临时文件
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }
      reject(new Error(`FFmpeg extraction failed: ${err.message}`));
    });

    // 开始处理
    command.run();
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
