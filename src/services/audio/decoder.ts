import { logger } from '@/services/utils/logger';
import { isElectron } from '@/services/utils/env';
import { smartDecodeAudio as extractWithFFmpeg } from './ffmpegExtractor';
import i18n from '@/i18n';

/**
 * Decode audio file to AudioBuffer
 */
export const decodeAudio = async (
  file: File,
  onProgress?: (progress: { stage: string; percent: number }) => void,
  signal?: AbortSignal
): Promise<AudioBuffer> => {
  // Check if already aborted
  if (signal?.aborted) {
    throw new DOMException('Audio decoding aborted', 'AbortError');
  }

  // Priority: file.path (from native dialog) > webUtils.getPathForFile > undefined
  const filePath = isElectron()
    ? (file as any).path || window.electronAPI.getFilePath(file) || undefined
    : undefined;

  // Debug logs
  logger.info('Audio decoding environment check:', {
    isElectron: isElectron(),
    hasFilePath: !!filePath,
    filePath: filePath,
  });

  // 在 Electron 环境下优先使用 FFmpeg
  if (isElectron() && filePath) {
    try {
      logger.info('Starting audio decoding using FFmpeg...');
      return await extractWithFFmpeg(file, onProgress, signal);
    } catch (err: any) {
      // Re-throw abort errors without fallback
      if (err.name === 'AbortError') {
        throw err;
      }
      logger.warn('FFmpeg failed, using Web Audio API fallback:', err.message);
      // 继续使用下面的 Web Audio API 降级方案
    }
  }

  logger.info('Starting audio decoding using Web Audio API...');
  let arrayBuffer: ArrayBuffer;

  // Electron: Use IPC for large files to avoid renderer process crash
  if (isElectron() && filePath) {
    arrayBuffer = await (window as any).electronAPI.readAudioFile(filePath);
  } else {
    // Web: Direct read (works for smaller files)
    arrayBuffer = await file.arrayBuffer();
  }

  const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContext) throw new Error(i18n.t('services:audio.errors.webAudioNotSupported'));
  const ctx = new AudioContext();

  try {
    return await ctx.decodeAudioData(arrayBuffer);
  } catch (e: any) {
    // Provide user-friendly error messages for common audio decoding failures
    if (e.name === 'EncodingError' || e.message?.includes('Unable to decode')) {
      throw new Error(i18n.t('services:audio.errors.unsupportedAudioFormat'));
    }
    if (e.name === 'NotSupportedError') {
      throw new Error(i18n.t('services:audio.errors.unsupportedBrowserEncoding'));
    }
    throw new Error(
      i18n.t('services:audio.errors.decodeFailed', { error: e.message || 'Unknown' })
    );
  } finally {
    // Always close AudioContext to prevent resource leaks
    await ctx.close();
  }
};

/**
 * Decode audio with automatic retry on failure
 */
export async function decodeAudioWithRetry(
  file: File,
  retries = 3,
  onProgress?: (progress: { stage: string; percent: number }) => void,
  signal?: AbortSignal
): Promise<AudioBuffer> {
  for (let i = 0; i < retries; i++) {
    // Check abort before each retry
    if (signal?.aborted) {
      throw new DOMException('Audio decoding aborted', 'AbortError');
    }
    try {
      return await decodeAudio(file, onProgress, signal);
    } catch (e: any) {
      // Re-throw abort errors without retry
      if (e.name === 'AbortError') {
        throw e;
      }
      if (i === retries - 1) {
        logger.error('Audio decode failed after retries', e);
        throw new Error(i18n.t('services:audio.errors.decodeRetryFailed'));
      }
      logger.warn(`Audio decode attempt ${i + 1} failed, retrying...`, e);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}
