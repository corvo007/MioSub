import { SubtitleItem } from '@/types/subtitle';
import { logger } from '@/services/utils/logger';

// Error types
class WhisperLocalError extends Error {
    constructor(public code: string, message: string) {
        super(message);
        this.name = 'WhisperLocalError';
    }
}

export const transcribeWithLocalWhisper = async (
    audioBlob: Blob,
    modelPath: string,
    language: string = 'auto',
    threads: number = 4,
    _port: number = 8080, // Deprecated
    _timeout: number = 300000, // Deprecated (handled by main process if needed)
    _maxRetries: number = 2 // Deprecated
): Promise<SubtitleItem[]> => {
    logger.info(`[LocalWhisper] Processing request - blob size: ${(audioBlob.size / 1024 / 1024).toFixed(2)}MB, Threads: ${threads}`);

    try {
        // Environment check
        if (!window.electronAPI) {
            throw new WhisperLocalError('NOT_ELECTRON', '本地 Whisper 仅在桌面应用中可用');
        }

        // Convert Blob to ArrayBuffer
        const arrayBuffer = await audioBlob.arrayBuffer();

        // Call Electron IPC
        logger.info(`[LocalWhisper] Sending request to main process. Model: ${modelPath}`);
        const result = await window.electronAPI.transcribeLocal({
            audioData: arrayBuffer,
            modelPath,
            language,
            threads
        });

        if (!result.success) {
            throw new WhisperLocalError('TRANSCRIPTION_FAILED', result.error || '转录失败');
        }

        logger.info(`[Success] Received ${result.segments?.length || 0} segments`);

        if (!result.segments) return [];

        return result.segments.map((seg: any, index: number) => ({
            id: index + 1,
            startTime: seg.start,
            endTime: seg.end,
            original: seg.text.trim(),
            translated: ''
        }));

    } catch (error: any) {
        logger.error(`[LocalWhisper] Error: ${error.message}`);
        if (error instanceof WhisperLocalError) {
            throw error;
        }
        throw new WhisperLocalError('UNKNOWN_ERROR', error.message);
    }
};
