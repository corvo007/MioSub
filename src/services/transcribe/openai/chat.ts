import { type SubtitleItem } from '@/types/subtitle';
import { formatTime } from '@/services/subtitle/time';
import i18n from '@/i18n';
import { blobToBase64 } from '@/services/audio/converter';
import { logger } from '@/services/utils/logger';
import { safeParseJsonArray } from '@/services/utils/jsonParser';
import { UserActionableError } from '@/services/utils/errors';
import { generateSubtitleId } from '@/services/utils/id';

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
    modalities: ['text'],
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: "Transcribe the following audio. Return ONLY a JSON object with a 'segments' array. Each segment must have 'start' (number, seconds), 'end' (number, seconds), and 'text' (string). Do not include any other markdown.",
          },
          {
            type: 'input_audio',
            input_audio: {
              data: base64Audio,
              format: 'wav',
            },
          },
        ],
      },
    ],
  };

  const baseUrl = endpoint || 'https://api.openai.com/v1';

  try {
    // Check cancellation
    if (signal?.aborted) {
      throw new Error(i18n.t('services:pipeline.errors.cancelled'));
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout || 600000); // Default 10 minutes

    // Handle external signal
    if (signal) {
      signal.addEventListener('abort', () => controller.abort());
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const status = response.status;
      const errorMsg = err.error?.message || response.statusText;

      // Check for user-actionable errors
      if (status === 401 || errorMsg.toLowerCase().includes('invalid api key')) {
        throw new UserActionableError(i18n.t('services:api.errors.invalidKey'));
      }
      if (
        status === 429 ||
        errorMsg.toLowerCase().includes('quota') ||
        errorMsg.toLowerCase().includes('rate limit')
      ) {
        throw new UserActionableError(i18n.t('services:api.network.rateLimited'));
      }
      if (status === 403) {
        throw new UserActionableError(i18n.t('services:api.errors.permissionDenied'));
      }

      throw new Error(
        i18n.t('services:api.openai.errors.transcriptionFailed', {
          error: errorMsg,
        })
      );
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    // Parse the JSON from the text response using unified parser
    let segments: any[] = [];
    try {
      segments = safeParseJsonArray(content || '[]');
    } catch (e) {
      logger.warn('Failed to parse GPT-4o JSON response', { error: e, responseText: content });
      // Fallback simple line parsing could go here, but avoiding for brevity
    }

    if (!Array.isArray(segments)) return [];

    return segments.map((seg) => ({
      id: generateSubtitleId(),
      startTime: formatTime(parseFloat(seg.start)),
      endTime: formatTime(parseFloat(seg.end)),
      original: seg.text ? seg.text.trim() : '',
      translated: '',
    }));
  } catch (e: any) {
    logger.warn('OpenAI Chat API request failed', {
      error: e.message,
      status: e.status,
      code: e.code,
      type: e.type,
      cause: e.cause?.message || e.cause,
      requestUrl: `${baseUrl}/chat/completions`,
      // Request parameters
      requestParams: {
        model,
        timeout,
        audioSize: audioBlob.size,
        promptPreview: (requestBody.messages[0]?.content as any[])?.[0]?.text?.substring(0, 100),
      },
    });
    throw new Error(i18n.t('services:api.openai.errors.transcriptionFailed', { error: e.message }));
  }
};
