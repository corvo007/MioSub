import { isElectron } from '@/services/utils/env';
import { logger } from '@/services/utils/logger';
import i18n from '@/i18n';
import { resolveBinaryPath } from '@/services/utils/binary';
import type { AudioExtractionOptions, AudioExtractionProgress } from '@/types/electron';

/**
 * 使用 FFmpeg 提取音频并解码为 AudioBuffer
 */
export async function extractAudioWithFFmpeg(
  file: File,
  onProgress?: (progress: { stage: string; percent: number }) => void
): Promise<AudioBuffer> {
  if (!isElectron()) {
    throw new Error(i18n.t('services:audio.errors.ffmpegElectronOnly'));
  }

  // Get file path
  const filePath = (file as any).path || window.electronAPI.getFilePath(file);
  if (!filePath) {
    throw new Error(i18n.t('services:audio.errors.ffmpegFilePathRequired'));
  }

  let extractedAudioPath: string | undefined;
  let cleanupListener: (() => void) | undefined;

  try {
    // 1. Get Audio Info
    logger.info('Getting audio info...');
    const infoResult = await window.electronAPI.getAudioInfo(filePath);
    if (!infoResult.success || !infoResult.info) {
      throw new Error(infoResult.error || i18n.t('services:audio.errors.getAudioInfoFailed'));
    }
    logger.info('Audio info:', infoResult.info);

    // 2. 注册进度监听
    if (onProgress) {
      cleanupListener = window.electronAPI.onAudioExtractionProgress(
        (progress: AudioExtractionProgress) => {
          onProgress({
            stage: 'extracting',
            percent: progress.percent,
          });
        }
      );
    }

    // 3. 提取音频
    logger.info('Extracting audio with FFmpeg...');

    // Resolve FFmpeg path
    let ffmpegPath: string | undefined;
    try {
      const settings = await window.electronAPI.storage.getSettings();
      ffmpegPath = await resolveBinaryPath(settings?.debug?.ffmpegPath, 'ffmpeg.exe', 'FFmpeg');
      logger.debug('Resolved FFmpeg path:', ffmpegPath);
    } catch (e: any) {
      logger.warn('Failed to resolve FFmpeg path, relying on default', {
        error: e.message,
      });
      // Fallback: undefined means let main process handle it (or use system PATH)
    }

    const options: AudioExtractionOptions = {
      format: 'wav',
      sampleRate: 16000, // Whisper 推荐采样率
      channels: 1, // 单声道
      customFfmpegPath: ffmpegPath,
    };

    const extractResult = await window.electronAPI.extractAudioFFmpeg(filePath, options);
    if (!extractResult.success || !extractResult.audioPath) {
      throw new Error(
        extractResult.error || i18n.t('services:audio.errors.ffmpegExtractionFailed')
      );
    }
    extractedAudioPath = extractResult.audioPath;
    logger.info('Audio extracted to:', extractedAudioPath);

    // 4. 读取音频数据
    if (onProgress) {
      onProgress({ stage: 'decoding', percent: 100 });
    }
    const arrayBuffer = await window.electronAPI.readExtractedAudio(extractedAudioPath);

    // Decode ArrayBuffer
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) {
      throw new Error(i18n.t('services:audio.errors.webAudioNotSupported'));
    }
    const ctx = new AudioContext();
    try {
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      logger.info('Audio decoded successfully');
      return audioBuffer;
    } finally {
      // Vital: Close AudioContext to release hardware resources
      await ctx.close();
    }
  } finally {
    // Clean up listener
    if (cleanupListener) {
      cleanupListener();
    }

    // 清理临时文件
    if (extractedAudioPath) {
      try {
        await window.electronAPI.cleanupTempAudio(extractedAudioPath);
        logger.info('Temp audio cleaned up');
      } catch (err: any) {
        logger.warn('Failed to cleanup temp audio', {
          error: err.message,
          path: extractedAudioPath,
        });
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
  // Priority: file.path (from native dialog) > webUtils.getPathForFile > undefined
  const filePath = isElectron()
    ? (file as any).path || window.electronAPI.getFilePath(file) || undefined
    : undefined;

  if (!isElectron() || !filePath) {
    // 非 Electron 环境或没有文件路径，直接使用 Web Audio API
    logger.info('Using Web Audio API for decoding');
    throw new Error('Use fallback decoder');
  }

  try {
    // 优先尝试 FFmpeg
    logger.info('Attempting FFmpeg extraction...');
    return await extractAudioWithFFmpeg(file, onProgress);
  } catch (err: any) {
    logger.warn('FFmpeg extraction failed, falling back to Web Audio API', {
      error: err.message,
      code: err.code,
      fileName: file.name,
      fileSize: file.size,
    });
    throw new Error('FFmpeg failed, use fallback');
  }
}
