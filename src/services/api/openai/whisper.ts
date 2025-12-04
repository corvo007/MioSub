import { SubtitleItem, OpenAIWhisperSegment } from '@/types/subtitle';
import { formatTime } from '@/services/subtitle/time';
import { logger } from '@/services/utils/logger';

export const transcribeWithWhisper = async (
    audioBlob: Blob,
    apiKey: string,
    model: string,
    endpoint?: string,
    timeout?: number,
    signal?: AbortSignal
): Promise<SubtitleItem[]> => {
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.wav');
    formData.append('model', model); // usually 'whisper-1'
    formData.append('response_format', 'verbose_json');

    // VAD (Voice Activity Detection) parameters to reduce hallucinations in silent segments
    formData.append('vad_filter', 'true');           // Enable VAD filtering to skip non-speech segments
    formData.append('no_speech_threshold', '0.6');   // Non-speech detection threshold (default: 0.6)

    let attempt = 0;
    const maxRetries = 3;
    let lastError: any;

    const baseUrl = endpoint || 'https://api.openai.com/v1';

    while (attempt < maxRetries) {
        try {
            // Check cancellation
            if (signal?.aborted) {
                throw new Error('操作已取消');
            }

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout || 600000); // Default 10 minutes

            // Handle external signal
            if (signal) {
                signal.addEventListener('abort', () => controller.abort());
            }

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
