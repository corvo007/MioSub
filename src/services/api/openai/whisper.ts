import { SubtitleItem, OpenAIWhisperSegment } from '@/types/subtitle';
import { formatTime } from '@/services/subtitle/time';
import { logger } from '@/services/utils/logger';

export const transcribeWithWhisper = async (
    audioBlob: Blob,
    apiKey: string,
    model: string,
    endpoint?: string,
    timeout?: number
): Promise<SubtitleItem[]> => {
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.wav');
    formData.append('model', model); // usually 'whisper-1'
    formData.append('response_format', 'verbose_json');

    let attempt = 0;
    const maxRetries = 3;
    let lastError: any;

    const baseUrl = endpoint || 'https://api.openai.com/v1';

    while (attempt < maxRetries) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout || 600000); // Default 10 minutes

            const response = await fetch(`${baseUrl}/audio/transcriptions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: formData,
                signal: controller.signal
            }).finally(() => clearTimeout(timeoutId));

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`Whisper API Error (${response.status}): ${errorData.error?.message || response.statusText}`);
            }

            const data = await response.json();
            const segments = data.segments as OpenAIWhisperSegment[];
            if (!segments) return [];

            return segments.map((seg, idx) => ({
                id: idx + 1,
                startTime: formatTime(seg.start),
                endTime: formatTime(seg.end),
                original: seg.text.trim(),
                translated: '' // Filled later by Gemini
            }));
        } catch (e: any) {
            logger.warn(`Whisper attempt ${attempt + 1} failed:`, e);
            lastError = e;
            attempt++;
            if (attempt < maxRetries) await new Promise(res => setTimeout(res, 1000 * Math.pow(2, attempt - 1)));
        }
    }

    throw lastError || new Error("Failed to connect to Whisper API.");
};
