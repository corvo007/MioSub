import { logger } from '@/services/utils/logger';
import { isElectron } from '@/services/utils/env';
import { smartDecodeAudio } from './ffmpegExtractor';

/**
 * Decode audio file to AudioBuffer
 */
export const decodeAudio = async (
  file: File,
  onProgress?: (progress: { stage: string; percent: number }) => void
): Promise<AudioBuffer> => {
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
      return await smartDecodeAudio(file, onProgress);
    } catch (err: any) {
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
  if (!AudioContext) throw new Error('不支持 Web Audio API');
  const ctx = new AudioContext();
  return await ctx.decodeAudioData(arrayBuffer);
};

/**
 * Decode audio with automatic retry on failure
 */
export async function decodeAudioWithRetry(
  file: File,
  retries = 3,
  onProgress?: (progress: { stage: string; percent: number }) => void
): Promise<AudioBuffer> {
  for (let i = 0; i < retries; i++) {
    try {
      return await decodeAudio(file, onProgress);
    } catch (e: any) {
      if (i < retries - 1) {
        logger.warn(`Audio decoding failed. Retrying...`, { attempt: i + 1, error: e.message });
        await new Promise((r) => setTimeout(r, 1000));
      } else {
        throw e;
      }
    }
  }
  throw new Error('音频解码重试后仍然失败。');
}
