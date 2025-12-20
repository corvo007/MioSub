import { type AppSettings } from '@/types/settings';
import { type ChunkStatus } from '@/types/api';
import { decodeAudioWithRetry } from '@/services/audio/decoder';
import { formatTime } from '@/services/subtitle/time';
import { SmartSegmenter } from '@/services/audio/segmenter';
import { logger } from '@/services/utils/logger';

export interface ChunkParams {
  index: number;
  start: number;
  end: number;
}

export interface PreprocessResult {
  audioBuffer: AudioBuffer;
  chunksParams: ChunkParams[];
  vadSegments?: { start: number; end: number }[];
  totalDuration: number;
  chunkDuration: number;
}

/**
 * Preprocess audio: decode and segment into chunks
 */
export async function preprocessAudio(
  audioSource: File | AudioBuffer,
  settings: AppSettings,
  onProgress?: (update: ChunkStatus) => void,
  signal?: AbortSignal
): Promise<PreprocessResult> {
  // 1. Decode Audio
  onProgress?.({ id: 'decoding', total: 1, status: 'processing', message: '正在解码音频...' });

  let audioBuffer: AudioBuffer;
  try {
    if (audioSource instanceof AudioBuffer) {
      audioBuffer = audioSource;
      onProgress?.({
        id: 'decoding',
        total: 1,
        status: 'completed',
        message: `使用缓存音频，时长: ${formatTime(audioBuffer.duration)}`,
      });
    } else {
      audioBuffer = await decodeAudioWithRetry(audioSource);
      onProgress?.({
        id: 'decoding',
        total: 1,
        status: 'completed',
        message: `解码完成，时长: ${formatTime(audioBuffer.duration)}`,
      });
    }
  } catch (e) {
    logger.error('Failed to decode audio', e);
    throw new Error('音频解码失败，请确保文件是有效的视频或音频格式。');
  }

  const totalDuration = audioBuffer.duration;
  const chunkDuration = settings.chunkDuration || 300;
  const totalChunks = Math.ceil(totalDuration / chunkDuration);

  // 2. Prepare chunks
  const chunksParams: ChunkParams[] = [];
  let vadSegments: { start: number; end: number }[] | undefined;

  if (settings.useSmartSplit) {
    onProgress?.({ id: 'segmenting', total: 1, status: 'processing', message: '正在智能分段...' });
    const segmenter = new SmartSegmenter();
    const result = await segmenter.segmentAudio(audioBuffer, chunkDuration, signal);
    logger.info('Smart Segmentation Results', {
      count: result.chunks.length,
      chunks: result.chunks,
    });

    result.chunks.forEach((seg, i) => {
      chunksParams.push({
        index: i + 1,
        start: seg.start,
        end: seg.end,
      });
    });

    // Cache VAD segments for reuse in speaker sampling
    vadSegments = result.vadSegments;
    logger.info(`Cached ${vadSegments.length} VAD segments for speaker profile extraction`);

    onProgress?.({
      id: 'segmenting',
      total: 1,
      status: 'completed',
      message: `智能分段完成，共 ${result.chunks.length} 个片段。`,
    });
  } else {
    // Standard fixed-size chunking
    let cursor = 0;
    for (let i = 0; i < totalChunks; i++) {
      const end = Math.min(cursor + chunkDuration, totalDuration);
      chunksParams.push({
        index: i + 1,
        start: cursor,
        end: end,
      });
      cursor += chunkDuration;
    }
    logger.info('Fixed Segmentation Results', { count: chunksParams.length, chunks: chunksParams });
  }

  return {
    audioBuffer,
    chunksParams,
    vadSegments,
    totalDuration,
    chunkDuration,
  };
}
