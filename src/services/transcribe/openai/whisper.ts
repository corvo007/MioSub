import { type SubtitleItem, type OpenAIWhisperSegment } from '@/types/subtitle';
import { generateSubtitleId } from '@/services/utils/id';
import { formatTime } from '@/services/subtitle/time';
import { logger } from '@/services/utils/logger';
import { UserActionableError } from '@/services/utils/errors';
import i18n from '@/i18n';

/**
 * Extracts a user-actionable error message from a Whisper/OpenAI API error.
 *
 * OpenAI error structure (from official SDK):
 * - status_code: HTTP status (400, 401, 403, 404, 429, 5xx)
 * - error.code: string like "invalid_api_key", "insufficient_quota"
 * - error.type: string like "invalid_request_error", "authentication_error"
 * - error.message: human-readable message
 */
function getActionableWhisperError(error: any): string | undefined {
  if (!error) return undefined;

  // Extract HTTP status and error details
  const httpStatus = error.status || error.status_code;
  const errorCode = error.code || error.error?.code || '';
  const errorType = error.type || error.error?.type || '';
  const msg = (error.message || error.error?.message || '').toLowerCase();

  // Combine for keyword matching
  const combined = `${msg} ${errorCode} ${errorType}`.toLowerCase();

  // === AuthenticationError (401) - Invalid API key ===
  if (
    httpStatus === 401 ||
    errorCode === 'invalid_api_key' ||
    errorType === 'authentication_error' ||
    combined.includes('unauthorized') ||
    combined.includes('invalid api key') ||
    combined.includes('incorrect api key')
  ) {
    return i18n.t('services:api.errors.invalidKey');
  }

  // === PermissionDeniedError (403) ===
  if (
    httpStatus === 403 ||
    errorType === 'permission_denied_error' ||
    combined.includes('forbidden') ||
    combined.includes('permission denied')
  ) {
    return i18n.t('services:api.errors.permissionDenied');
  }

  // === RateLimitError (429) - Quota exceeded ===
  if (
    httpStatus === 429 ||
    errorCode === 'insufficient_quota' ||
    errorCode === 'rate_limit_exceeded' ||
    errorType === 'rate_limit_error' ||
    combined.includes('quota') ||
    combined.includes('rate limit') ||
    combined.includes('too many requests')
  ) {
    return i18n.t('services:api.network.rateLimited');
  }

  // === Billing/Payment issues ===
  if (
    errorCode === 'billing_hard_limit_reached' ||
    combined.includes('insufficient') ||
    combined.includes('billing') ||
    combined.includes('payment') ||
    combined.includes('balance')
  ) {
    return i18n.t('services:api.openai.errors.billingHardLimit');
  }

  // === NotFoundError (404) ===
  if (
    httpStatus === 404 ||
    errorType === 'not_found_error' ||
    combined.includes('model not found') ||
    combined.includes('not found')
  ) {
    return i18n.t('services:api.errors.modelNotFound');
  }

  // === BadRequestError (400) - Invalid parameters ===
  if (httpStatus === 400 && !combined.includes('api key')) {
    if (combined.includes('audio') || combined.includes('file')) {
      return i18n.t('services:api.openai.errors.invalidAudioFormat');
    }
  }

  return undefined;
}

export const transcribeWithWhisper = async (
  audioBlob: Blob,
  apiKey: string,
  model: string,
  endpoint?: string,
  timeout?: number,
  signal?: AbortSignal
): Promise<SubtitleItem[]> => {
  const formData = new FormData();
  // Convert File to pure Blob to ensure filename override works
  // File objects ignore the third parameter in FormData.append(), using their own name property
  // which may contain non-ASCII characters that violate HTTP header ISO-8859-1 requirements
  const pureBlob =
    audioBlob instanceof File
      ? new Blob([audioBlob], { type: audioBlob.type || 'audio/wav' })
      : audioBlob;
  formData.append('file', pureBlob, 'audio.wav');
  formData.append('model', model); // usually 'whisper-1'
  formData.append('response_format', 'verbose_json');

  // VAD (Voice Activity Detection) parameters to reduce hallucinations in silent segments
  formData.append('vad_filter', 'true'); // Enable VAD filtering to skip non-speech segments
  formData.append('no_speech_threshold', '0.6'); // Non-speech detection threshold (default: 0.6)

  let attempt = 0;
  const maxRetries = 3;
  let lastError: any;

  const baseUrl = endpoint || 'https://api.openai.com/v1';

  while (attempt < maxRetries) {
    try {
      // Check cancellation
      if (signal?.aborted) {
        throw new Error(i18n.t('services:pipeline.errors.cancelled'));
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout || 600000); // Default 10 minutes

      // Handle external signal - use { once: true } to auto-remove after trigger
      const abortHandler = () => controller.abort();
      if (signal) {
        signal.addEventListener('abort', abortHandler, { once: true });
      }

      const response = await fetch(`${baseUrl}/audio/transcriptions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: formData,
        signal: controller.signal,
      }).finally(() => {
        clearTimeout(timeoutId);
        // Clean up abort listener to prevent memory leaks
        if (signal) {
          signal.removeEventListener('abort', abortHandler);
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        // Create error object with OpenAI's error structure for consistent handling
        const error: any = new Error(
          `Whisper API Error (${response.status}): ${errorData.error?.message || response.statusText}`
        );
        error.status = response.status;
        error.code = errorData.error?.code;
        error.type = errorData.error?.type;
        error.error = errorData.error; // Preserve full error object
        throw error;
      }

      const data = await response.json();
      const segments = data.segments as OpenAIWhisperSegment[];
      if (!segments) return [];

      return segments.map((seg) => ({
        id: generateSubtitleId(),
        startTime: formatTime(seg.start),
        endTime: formatTime(seg.end),
        original: seg.text.trim(),
        translated: '', // Filled later by Gemini
      }));
    } catch (e: any) {
      logger.warn(`Whisper API attempt ${attempt + 1} failed`, {
        error: e.message,
        status: e.status,
        code: e.code,
        type: e.type,
        cause: e.cause?.message || e.cause,
        requestUrl: `${baseUrl}/audio/transcriptions`,
        // Request parameters
        requestParams: {
          model,
          timeout,
          audioSize: audioBlob.size,
          responseFormat: 'verbose_json',
        },
      });
      lastError = e;

      // Don't retry for authentication/permission errors - they won't resolve
      const actionableMsg = getActionableWhisperError(e);
      if (actionableMsg && (e.status === 401 || e.status === 403)) {
        throw new UserActionableError(actionableMsg);
      }

      attempt++;
      if (attempt < maxRetries)
        await new Promise((res) => setTimeout(res, 1000 * Math.pow(2, attempt - 1)));
    }
  }

  // Check for actionable error message before throwing
  const actionableMessage = getActionableWhisperError(lastError);
  if (actionableMessage) {
    throw new UserActionableError(actionableMessage);
  }

  throw lastError || new Error(i18n.t('services:api.errors.connectionFailed'));
};
