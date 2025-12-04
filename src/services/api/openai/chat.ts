import { SubtitleItem } from '@/types/subtitle';
import { formatTime } from '@/services/subtitle/time';
import { blobToBase64 } from '@/services/audio/converter';
import { logger } from '@/services/utils/logger';
import { extractJsonArray } from '@/services/subtitle/parser';

export const transcribeWithOpenAIChat = async (
    audioBlob: Blob,
    apiKey: string,
    model: string,
    endpoint?: string,
    timeout?: number,
    signal?: AbortSignal
): Promise<SubtitleItem[]> => {
    logger.debug(`Starting OpenAI Chat transcription with model: ${model}`);
    const base64Audio = await blobToBase64(audioBlob);

    const requestBody = {
        model: model, // e.g., 'gpt-4o-audio-preview'
        modalities: ["text"],
        messages: [
            {
                role: "user",
                content: [
                    {
                        type: "text",
                        text: "Transcribe the following audio. Return ONLY a JSON object with a 'segments' array. Each segment must have 'start' (number, seconds), 'end' (number, seconds), and 'text' (string). Do not include any other markdown."
                    },
                    {
                        type: "input_audio",
                        input_audio: {
                            data: base64Audio,
                            format: "wav"
                        }
                    }
                ]
            }
        ]
    };

    const baseUrl = endpoint || 'https://api.openai.com/v1';

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

        const response = await fetch(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal
        }).finally(() => clearTimeout(timeoutId));

        if (!response.ok) {
            const err = await response.json();
            throw new Error(`GPT-4o 转录错误：${err.error?.message || response.statusText}`);
        }

        const data = await response.json();
        const content = data.choices[0]?.message?.content;

        // Parse the JSON from the text response
        let segments: any[] = [];
        try {
            const cleanJson = content.replace(/```json/g, '').replace(/```/g, '').trim();
            const extracted = extractJsonArray(cleanJson);
            const textToParse = extracted || cleanJson;

            const parsed = JSON.parse(textToParse);
            segments = parsed.segments || parsed.items || parsed;
        } catch (e) {
            console.warn("Failed to parse GPT-4o JSON response", content);
            // Fallback simple line parsing could go here, but avoiding for brevity
        }

        if (!Array.isArray(segments)) return [];

        return segments.map((seg, idx) => ({
            id: idx + 1,
            startTime: formatTime(parseFloat(seg.start)),
            endTime: formatTime(parseFloat(seg.end)),
            original: seg.text ? seg.text.trim() : "",
            translated: ""
        }));

    } catch (e: any) {
        throw new Error(`GPT-4o 音频转录失败：${e.message}`);
    }
};
