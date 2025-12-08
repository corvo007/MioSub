import { isElectron } from '@/services/utils/env';
import { logger } from '@/services/utils/logger';
import type { AudioExtractionOptions, AudioExtractionProgress } from '@/types/electron';

/**
 * 使用 FFmpeg 提取音频并解码为 AudioBuffer
 */
export async function extractAndDecodeAudio(
  file: File,
  onProgress?: (progress: { stage: string; percent: number }) => void
): Promise<AudioBuffer> {
  if (!isElectron()) {
    throw new Error('FFmpeg 提取仅在 Electron 环境中可用');
  }

  const filePath = window.electronAPI.getFilePath(file);
  if (!filePath) {
    throw new Error('FFmpeg 提取需要文件路径');
  }

  let extractedAudioPath: string | undefined;

  try {
    // 1. 获取音频信息
    logger.info('Getting audio info...');
    const infoResult = await window.electronAPI.getAudioInfo(filePath);
    if (!infoResult.success || !infoResult.info) {
      throw new Error(infoResult.error || '获取音频信息失败');
    }
    logger.info('Audio info:', infoResult.info);

    // 2. 注册进度监听
    if (onProgress) {
      window.electronAPI.onAudioExtractionProgress((progress: AudioExtractionProgress) => {
        onProgress({
          stage: 'extracting',
          percent: progress.percent,
        });
      });
    }

    // 3. 提取音频
    logger.info('Extracting audio with FFmpeg...');

    // Get settings to check for custom FFmpeg path
    let customFfmpegPath: string | undefined;
    try {
      const settings = await window.electronAPI.storage.getSettings();
      if (settings?.debug?.ffmpegPath) {
        customFfmpegPath = settings.debug.ffmpegPath;
        logger.info('Using custom FFmpeg path from settings:', customFfmpegPath);
      }
    } catch (e) {
      logger.warn('Failed to read settings for FFmpeg path:', e);
    }

    const options: AudioExtractionOptions = {
      format: 'wav',
      sampleRate: 16000, // Whisper 推荐采样率
      channels: 1, // 单声道
      customFfmpegPath,
    };

    const extractResult = await window.electronAPI.extractAudioFFmpeg(filePath, options);
    if (!extractResult.success || !extractResult.audioPath) {
      throw new Error(extractResult.error || 'FFmpeg 提取失败');
    }
    extractedAudioPath = extractResult.audioPath;
    logger.info('Audio extracted to:', extractedAudioPath);

    // 4. 读取音频数据
    if (onProgress) {
      onProgress({ stage: 'decoding', percent: 100 });
    }
    const arrayBuffer = await window.electronAPI.readExtractedAudio(extractedAudioPath);

    // 5. 解码为 AudioBuffer
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) {
      throw new Error('不支持 Web Audio API');
    }
    const ctx = new AudioContext();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

    logger.info('Audio decoded successfully');
    return audioBuffer;
  } finally {
    // 清理临时文件
    if (extractedAudioPath) {
      try {
        await window.electronAPI.cleanupTempAudio(extractedAudioPath);
        logger.info('Temp audio cleaned up');
      } catch (err) {
        logger.warn('Failed to cleanup temp audio:', err);
      }
    }
  }
}

/**
 * 智能音频解码：优先使用 FFmpeg，失败时降级到 Web Audio API
 */
export async function smartDecodeAudio(
  file: File,
  onProgress?: (progress: { stage: string; percent: number }) => void
): Promise<AudioBuffer> {
  const filePath = isElectron() ? window.electronAPI.getFilePath(file) : undefined;

  if (!isElectron() || !filePath) {
    // 非 Electron 环境或没有文件路径，直接使用 Web Audio API
    logger.info('Using Web Audio API for decoding');
    throw new Error('Use fallback decoder');
  }

  try {
    // 优先尝试 FFmpeg
    logger.info('Attempting FFmpeg extraction...');
    return await extractAndDecodeAudio(file, onProgress);
  } catch (err: any) {
    logger.warn('FFmpeg extraction failed, falling back to Web Audio API:', err.message);
    throw new Error('FFmpeg failed, use fallback');
  }
}
