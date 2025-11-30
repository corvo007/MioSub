import { SubtitleItem } from '@/types/subtitle';
import { logger } from '@/services/utils/logger';
import { transcribeWithWhisper } from './whisper';
import { transcribeWithOpenAIChat } from './chat';

export const transcribeAudio = async (
    audioBlob: Blob,
    apiKey: string,
    model: string = 'whisper-1',
    endpoint?: string,
    timeout?: number
): Promise<SubtitleItem[]> => {
    logger.debug(`Starting transcription with model: ${model} on endpoint: ${endpoint || 'default'}`);
    if (model.includes('gpt-4o')) {
        return transcribeWithOpenAIChat(audioBlob, apiKey, model, endpoint, timeout);
    } else {
        return transcribeWithWhisper(audioBlob, apiKey, model, endpoint, timeout);
    }
};
