import { SubtitleItem } from '@/types/subtitle';
import { logger } from '@/services/utils/logger';
import { transcribeWithWhisper } from './whisper';
import { transcribeWithOpenAIChat } from './chat';
import { transcribeWithLocalWhisper } from '@/services/api/whisper-local/transcribe';

export const transcribeAudio = async (
    audioBlob: Blob,
    apiKey: string,
    model: string = 'whisper-1',
    endpoint?: string,
    timeout?: number,
    useLocalWhisper?: boolean,
    localModelPath?: string,
    localThreads?: number
): Promise<SubtitleItem[]> => {
    // Try local Whisper
    if (useLocalWhisper && window.electronAPI) {
        if (!localModelPath) {
            throw new Error('Local Whisper enabled but no model path provided');
        }
        try {
            logger.debug('Attempting local whisper');
            return await transcribeWithLocalWhisper(audioBlob, localModelPath, 'auto', localThreads);
        } catch (error: any) {
            logger.warn('Local failed, fallback to API:', error.message);

            if (apiKey) {
                // Show fallback toast
                if (typeof window !== 'undefined' && (window as any).showToast) {
                    (window as any).showToast(
                        `本地转录失败，切换到在线 API`,
                        'warning'
                    );
                }
                logger.info('Falling back to API');
            } else {
                throw new Error(`本地转录失败: ${error.message}`);
            }
        }
    }

    logger.debug(`Starting transcription with model: ${model} on endpoint: ${endpoint || 'default'}`);
    if (model.includes('gpt-4o')) {
        return transcribeWithOpenAIChat(audioBlob, apiKey, model, endpoint, timeout);
    } else {
        return transcribeWithWhisper(audioBlob, apiKey, model, endpoint, timeout);
    }
};
