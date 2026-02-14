import { type AppSettings } from '@/types/settings';
import { type ChunkStatus } from '@/types/api';
import { decodeAudioWithRetry } from '@/services/audio/decoder';
import { formatTime } from '@/services/subtitle/time';
import { SmartSegmenter } from '@/services/audio/segmenter';
import { LONG_VIDEO_THRESHOLD, isLongVideo } from '@/services/audio/segmentExtractor';
import { logger } from '@/services/utils/logger';
import i18n from '@/i18n';

export interface ChunkParams {
  index: number;
  start: number;
  end: number;
}

export interface PreprocessResult {
  audioBuffer: AudioBuffer | null; // null for long videos (on-demand extraction)
  videoPath?: string; // Required for long videos (on-demand extraction)
  isLongVideo: boolean; // Flag to indicate long video mode
  chunksParams: ChunkParams[];
  vadSegments?: { start: number; end: number }[];
  totalDuration: number;
  chunkDuration: number;
}

/**
 * Preprocess audio: decode and segment into chunks
 * For long videos (>2h), uses fixed segmentation without loading AudioBuffer to avoid OOM
 */
export async function preprocessAudio(
  audioSource: File | AudioBuffer,
  settings: AppSettings,
  onProgress?: (update: ChunkStatus) => void,
  signal?: AbortSignal,
  videoPath?: string // Optional video path for long video on-demand extraction
): Promise<PreprocessResult> {
  const chunkDuration = settings.chunkDuration || 120;

  // Check if we should use long video mode (on-demand extraction)
  // This requires: Electron environment + video path + duration > threshold
  if (videoPath && window.electronAPI?.getAudioInfo) {
    try {
      const infoResult = await window.electronAPI.getAudioInfo(videoPath);
      if (infoResult.success && infoResult.info) {
        const duration = infoResult.info.duration;

        if (isLongVideo(duration)) {
          logger.info(
            `Long video detected (${formatTime(duration)} > ${formatTime(LONG_VIDEO_THRESHOLD)}). Using on-demand segment extraction.`
          );

          onProgress?.({
            id: 'decoding',
            total: 1,
            status: 'completed',
            message: i18n.t('services:pipeline.status.longVideoMode', {
              duration: formatTime(duration),
            }),
          });

          // Generate fixed chunks without loading AudioBuffer
          const chunksParams = generateFixedChunks(duration, chunkDuration);

          logger.info('Fixed Segmentation Results (Long Video Mode)', {
            count: chunksParams.length,
            chunks: chunksParams,
          });

          return {
            audioBuffer: null,
            videoPath,
            isLongVideo: true,
            chunksParams,
            totalDuration: duration,
            chunkDuration,
          };
        }
      }
    } catch (e) {
      logger.warn(
        'Failed to get audio info for long video detection, falling back to standard mode',
        e
      );
    }
  }

  // Standard mode: decode audio into memory
  // 1. Decode Audio
  onProgress?.({
    id: 'decoding',
    total: 1,
    status: 'processing',
    message: i18n.t('services:pipeline.status.decoding'),
  });

  let audioBuffer: AudioBuffer;
  try {
    if (audioSource instanceof AudioBuffer) {
      audioBuffer = audioSource;
      onProgress?.({
        id: 'decoding',
        total: 1,
        status: 'completed',
        message: i18n.t('services:pipeline.status.decodingUsingCache', {
          duration: formatTime(audioBuffer.duration),
        }),
      });
    } else {
      audioBuffer = await decodeAudioWithRetry(audioSource);
      onProgress?.({
        id: 'decoding',
        total: 1,
        status: 'completed',
        message: i18n.t('services:pipeline.status.decodingComplete', {
          duration: formatTime(audioBuffer.duration),
        }),
      });
    }
  } catch (e) {
    logger.error('Failed to decode audio', e);
    throw new Error(i18n.t('services:pipeline.errors.decodeFailed'));
  }

  const totalDuration = audioBuffer.duration;
  const totalChunks = Math.ceil(totalDuration / chunkDuration);

  // 2. Prepare chunks
  const chunksParams: ChunkParams[] = [];
  let vadSegments: { start: number; end: number }[] | undefined;

  if (settings.useSmartSplit) {
    onProgress?.({
      id: 'segmenting',
      total: 1,
      status: 'processing',
      message: i18n.t('services:pipeline.status.segmenting'),
    });
    const segmenter = SmartSegmenter.getInstance();
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

    // Note: Singleton will be disposed at pipeline end via SmartSegmenter.disposeInstance()

    onProgress?.({
      id: 'segmenting',
      total: 1,
      status: 'completed',
      message: i18n.t('services:pipeline.status.segmentingComplete', {
        count: result.chunks.length,
      }),
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
    videoPath,
    isLongVideo: false,
    chunksParams,
    vadSegments,
    totalDuration,
    chunkDuration,
  };
}

/**
 * Generate fixed-size chunks for long videos
 */
function generateFixedChunks(duration: number, chunkDuration: number): ChunkParams[] {
  const chunks: ChunkParams[] = [];
  let cursor = 0;
  let index = 1;

  while (cursor < duration) {
    const end = Math.min(cursor + chunkDuration, duration);
    chunks.push({ index, start: cursor, end });
    cursor = end;
    index++;
  }

  return chunks;
}
