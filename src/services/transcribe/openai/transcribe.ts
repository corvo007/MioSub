import { type SubtitleItem } from '@/types/subtitle';
import { logger } from '@/services/utils/logger';
import i18n from '@/i18n';
import { transcribeWithWhisper } from '@/services/transcribe/openai/whisper';
import { transcribeWithOpenAIChat } from '@/services/transcribe/openai/chat';
import { transcribeWithLocalWhisper } from '@/services/transcribe/whisper-local/transcribe';

export const transcribeAudio = async (
  audioBlob: Blob,
  apiKey: string,
  model: string = 'whisper-1',
  endpoint?: string,
  timeout?: number,
  useLocalWhisper?: boolean,
  localModelPath?: string,
  localThreads?: number,
  signal?: AbortSignal,
  customBinaryPath?: string
): Promise<SubtitleItem[]> => {
  // Check cancellation
  if (signal?.aborted) {
    throw new Error(i18n.t('services:pipeline.errors.cancelled'));
  }

  // Try local Whisper
  if (useLocalWhisper && window.electronAPI) {
    if (!localModelPath) {
      throw new Error(i18n.t('services:api.whisperLocal.errors.noModelPath'));
    }
    try {
      logger.debug('Attempting local whisper via unified implementation');
      return await transcribeWithLocalWhisper(
        audioBlob,
        localModelPath,
        'auto',
        localThreads,
        signal,
        customBinaryPath
      );
    } catch (error: any) {
      // If cancelled, rethrow immediately to avoid fallback
      if (signal?.aborted || error.message === i18n.t('services:pipeline.errors.cancelled')) {
        throw error;
      }

      logger.warn('Local Whisper failed, attempting fallback to API', {
        error: error.message,
        code: error.code,
        localModelPath,
        localThreads,
        customBinaryPath,
      });

      if (apiKey) {
        // Show fallback toast
        if (typeof window !== 'undefined' && (window as any).showToast) {
          (window as any).showToast(
            i18n.t('services:api.whisperLocal.errors.fallbackToApi'),
            'warning'
          );
        }
        logger.info('Falling back to API');
      } else {
        throw new Error(
          `${i18n.t('services:api.whisperLocal.errors.transcriptionFailed')}: ${error.message}`
        );
      }
    }
  }

  logger.debug(`Starting transcription with model: ${model} on endpoint: ${endpoint || 'default'}`);
  if (model.includes('gpt-4o')) {
    return transcribeWithOpenAIChat(audioBlob, apiKey, model, endpoint, timeout, signal);
  } else {
    return transcribeWithWhisper(audioBlob, apiKey, model, endpoint, timeout, signal);
  }
};
