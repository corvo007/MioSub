import { type SubtitleItem } from '@/types/subtitle';
import { logger } from '@/services/utils/logger';
import i18n from '@/i18n';
import { generateSubtitleId } from '@/services/utils/id';
import { resolveBinaryPath } from '@/services/utils/binary';

// Error types
class WhisperLocalError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'WhisperLocalError';
  }
}

export const transcribeWithLocalWhisper = async (
  audioBlob: Blob,
  modelPath: string,
  language: string = 'auto',
  threads: number = 4,
  signal?: AbortSignal,
  customBinaryPath?: string
): Promise<SubtitleItem[]> => {
  logger.info(
    `[LocalWhisper] Processing request - blob size: ${(audioBlob.size / 1024 / 1024).toFixed(2)}MB, Threads: ${threads}`
  );

  try {
    // 1. Environment check
    if (!window.electronAPI) {
      throw new WhisperLocalError(
        'NOT_ELECTRON',
        i18n.t('services:api.whisperLocal.errors.notElectron')
      );
    }

    // 2. Convert Blob to ArrayBuffer
    const arrayBuffer = await audioBlob.arrayBuffer();

    if (signal?.aborted) {
      throw new Error(i18n.t('services:pipeline.errors.cancelled'));
    }

    // Resolve Whisper binary path
    const binaryPath = await resolveBinaryPath(customBinaryPath, 'whisper-cli', 'Whisper');
    logger.debug(`[LocalWhisper] Resolved binary path: ${binaryPath}`);

    // Call Electron IPC
    logger.info(`[LocalWhisper] Sending request to main process. Model: ${modelPath}`);

    // Wrap IPC call in a Promise.race to allow cancellation
    const transcriptionPromise = window.electronAPI.transcribeLocal({
      audioData: arrayBuffer,
      modelPath,
      language,
      threads,
      customBinaryPath: binaryPath,
    });

    // Track abort handler for cleanup
    let abortHandler: (() => void) | null = null;

    const cancelPromise = new Promise<never>((_, reject) => {
      if (signal) {
        abortHandler = () => {
          logger.info('[LocalWhisper] Transcription cancelled by user');

          // Notify main process to abort the running whisper process
          if (window.electronAPI?.abortLocalWhisper) {
            logger.info('[LocalWhisper] Sending abort signal to main process');
            window.electronAPI.abortLocalWhisper().catch((err: any) => {
              logger.error('[LocalWhisper] Failed to abort main process whisper', { error: err });
            });
          }

          reject(new Error(i18n.t('services:pipeline.errors.cancelled')));
        };
        // Use { once: true } to auto-remove after first trigger
        signal.addEventListener('abort', abortHandler, { once: true });
      }
    });

    try {
      const result = await Promise.race([transcriptionPromise, cancelPromise]);

      if (!result.success) {
        throw new WhisperLocalError(
          'TRANSCRIPTION_FAILED',
          result.error || i18n.t('services:api.whisperLocal.errors.transcriptionFailed')
        );
      }

      // Check status for empty results with error indicators
      if (result.status === 'empty_with_error') {
        logger.warn('[LocalWhisper] Transcription returned empty with error indicators', {
          errorHint: result.errorHint,
        });
        throw new WhisperLocalError(
          'TRANSCRIPTION_WARNING',
          i18n.t('services:api.whisperLocal.errors.transcriptionWarning', {
            details: result.errorHint || '',
          })
        );
      }

      if (result.status === 'empty') {
        // Genuine "no speech" case
        logger.info('[LocalWhisper] No speech detected in audio');
      }

      logger.info(`[Success] Received ${result.segments?.length || 0} segments`);

      if (!result.segments) return [];

      return result.segments.map((seg: any) => ({
        id: generateSubtitleId(),
        startTime: seg.start,
        endTime: seg.end,
        original: seg.text.trim(),
        translated: '',
      }));
    } finally {
      // Clean up abort listener to prevent memory leaks
      if (signal && abortHandler) {
        signal.removeEventListener('abort', abortHandler);
      }
    }
  } catch (error: any) {
    if (signal?.aborted || error.message === i18n.t('services:pipeline.errors.cancelled')) {
      logger.info('[LocalWhisper] Transcription process cancelled');
      throw error;
    }

    logger.error('[LocalWhisper] Transcription failed', {
      error: error.message,
      code: error.code,
      modelPath,
      threads,
      customBinaryPath,
      blobSize: audioBlob.size,
    });
    if (error instanceof WhisperLocalError) {
      throw error;
    }
    throw new WhisperLocalError('UNKNOWN_ERROR', error.message);
  }
};
