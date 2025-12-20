import { type GoogleGenAI, type Part, type Content } from '@google/genai';
import { logger } from '@/services/utils/logger';
import { SAFETY_SETTINGS } from '@/services/api/gemini/schemas';
import { extractJsonArray } from '@/services/subtitle/parser';
import { type TokenUsage } from '@/types/api';

/**
 * Determines if an error should trigger a retry attempt.
 * Returns true for transient errors (network, server, parsing), false for permanent errors (auth, quota).
 */
/**
 * Formats a Gemini API error into a detailed object for logging.
 * Tries to extract the raw response body if available.
 */
export function formatGeminiError(e: any): any {
  if (!e) return e;

  const errorInfo: any = {
    name: e.name || 'Error',
    message: e.message || 'Unknown error',
    status: e.status,
    statusText: e.statusText,
  };

  // Extract raw response if available
  if (e.response) {
    errorInfo.response = e.response;
  }

  if (e.body) {
    errorInfo.body = e.body;
  }

  if (e.errorDetails) {
    errorInfo.errorDetails = e.errorDetails;
  }

  // Attempt to extract JSON from message if it looks like a raw API error
  // e.g. "[400 Bad Request] {...}"
  if (typeof e.message === 'string') {
    const jsonMatch = e.message.match(/\{.*}/);
    if (jsonMatch) {
      try {
        errorInfo.rawError = JSON.parse(jsonMatch[0]);
      } catch (ignore) {
        // Not valid JSON
      }
    }
  }

  return errorInfo;
}

/**
 * Extracts a user-actionable error message from an API error.
 * Leverages the SDK's ApiError structure (name, message, status, rawError).
 * Returns undefined for transient/retryable errors that don't need user action.
 *
 * Official error codes from Gemini API docs:
 * - 400 INVALID_ARGUMENT / FAILED_PRECONDITION
 * - 403 PERMISSION_DENIED
 * - 404 NOT_FOUND
 * - 429 RESOURCE_EXHAUSTED
 * - 500 INTERNAL
 * - 503 UNAVAILABLE
 * - 504 DEADLINE_EXCEEDED
 */
export function getActionableErrorMessage(error: any): string | undefined {
  if (!error) return undefined;

  // SDK ApiError provides: name, message, status (HTTP code), rawError
  const httpStatus = error.status || error.response?.status;
  const rawError = error.rawError?.error; // SDK provides parsed error object

  // Extract status string, reason, and message from rawError
  let errorStatus = ''; // e.g., "INVALID_ARGUMENT", "PERMISSION_DENIED"
  let reason = ''; // e.g., "API_KEY_INVALID" from details
  let actualMessage = '';

  if (rawError) {
    // Use SDK's parsed rawError directly
    errorStatus = (rawError.status || '').toLowerCase();
    actualMessage = (rawError.message || '').toLowerCase();
    if (rawError.details && Array.isArray(rawError.details)) {
      for (const detail of rawError.details) {
        if (detail.reason) {
          reason = detail.reason.toLowerCase();
          break;
        }
      }
    }
  } else {
    // Fallback: try to parse JSON from message string
    const originalMessage = error.message || '';
    try {
      const jsonMatch = originalMessage.match(/\{.*\}/s);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.error) {
          errorStatus = (parsed.error.status || '').toLowerCase();
          actualMessage = (parsed.error.message || '').toLowerCase();
          if (parsed.error.details && Array.isArray(parsed.error.details)) {
            for (const detail of parsed.error.details) {
              if (detail.reason) {
                reason = detail.reason.toLowerCase();
                break;
              }
            }
          }
        }
      }
    } catch {
      // Not JSON, use original message
    }
    if (!actualMessage) {
      actualMessage = originalMessage.toLowerCase();
    }
  }

  // Combine for keyword matching
  const combinedMsg = `${actualMessage} ${reason} ${errorStatus}`;

  // === API Key Invalid (reason: API_KEY_INVALID) ===
  // Gemini returns HTTP 400 with reason "API_KEY_INVALID" for invalid keys
  if (
    reason === 'api_key_invalid' ||
    combinedMsg.includes('api key not valid') ||
    combinedMsg.includes('invalid api key') ||
    httpStatus === 401 ||
    combinedMsg.includes('unauthorized')
  ) {
    return 'API 密钥无效！请检查您的 API 密钥是否正确配置。';
  }

  // === FAILED_PRECONDITION (400) - Need to enable billing ===
  // "Gemini API 免费层级尚未在您所在的国家/地区推出。请在 Google AI Studio 中为您的项目启用结算功能。"
  if (
    errorStatus === 'failed_precondition' ||
    combinedMsg.includes('enable billing') ||
    combinedMsg.includes('启用结算') ||
    combinedMsg.includes('free tier') ||
    combinedMsg.includes('免费层级')
  ) {
    return 'Gemini API 免费层级不可用！请在 Google AI Studio 中为您的项目启用结算功能。';
  }

  // === PERMISSION_DENIED (403) - API key doesn't have permission ===
  if (
    httpStatus === 403 ||
    errorStatus === 'permission_denied' ||
    combinedMsg.includes('permission denied') ||
    combinedMsg.includes('forbidden') ||
    combinedMsg.includes('access denied')
  ) {
    return 'API 访问被拒绝 (403)！请检查：1) API 密钥权限设置 2) API 是否为当前地区启用 3) 是否需要开启计费';
  }

  // === RESOURCE_EXHAUSTED (429) - Rate limit / quota exceeded ===
  if (
    httpStatus === 429 ||
    errorStatus === 'resource_exhausted' ||
    combinedMsg.includes('quota') ||
    combinedMsg.includes('rate limit') ||
    combinedMsg.includes('too many requests')
  ) {
    return 'API 配额已用尽或请求过于频繁 (429)！请稍后重试，或检查您的 API 配额限制。';
  }

  // === NOT_FOUND (404) - Resource not found ===
  if (httpStatus === 404 || errorStatus === 'not_found') {
    if (combinedMsg.includes('model')) {
      return '请求的模型不存在 (404)！请检查模型名称是否正确。';
    }
    return '请求的资源不存在 (404)！请检查请求参数。';
  }

  // === Region/Location restrictions ===
  if (
    combinedMsg.includes('region') ||
    combinedMsg.includes('location') ||
    combinedMsg.includes('not available in') ||
    combinedMsg.includes('国家/地区')
  ) {
    return 'API 在当前地区不可用！请检查是否需要使用代理或更换 API 端点。';
  }

  // Return undefined for transient errors (500, 503, 504) - these should be retried
  return undefined;
}

export function isRetryableError(error: any): boolean {
  if (!error) return false;

  const status = error.status || error.response?.status;
  const msg = error.message || '';
  const code = error.code || '';

  // Timeout errors
  if (
    code === 'ETIMEDOUT' ||
    code === 'ECONNABORTED' ||
    code === 'ENOTFOUND' || // DNS resolution failed
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.toLowerCase().includes('timeout')
  ) {
    return true;
  }

  // Rate limits (429)
  if (status === 429 || msg.includes('429') || msg.includes('Resource has been exhausted')) {
    return true;
  }

  // Server errors (500, 503)
  if (status === 503 || status === 500 || msg.includes('503') || msg.includes('Overloaded')) {
    return true;
  }

  // Network errors (fetch failed, network changed, connection reset, etc.)
  const msgLower = msg.toLowerCase();
  if (
    msgLower.includes('fetch failed') ||
    msgLower.includes('failed to fetch') ||
    msgLower.includes('network') ||
    msgLower.includes('econnrefused') ||
    msgLower.includes('econnreset') ||
    msgLower.includes('err_network')
  ) {
    return true;
  }

  // JSON parsing errors (often due to truncated response)
  if (msg.includes('JSON') || msg.includes('SyntaxError')) {
    return true;
  }

  return false;
}

export async function generateContentWithRetry(
  ai: GoogleGenAI,
  params: any,
  retries = 3,
  signal?: AbortSignal,
  onUsage?: (usage: TokenUsage) => void,
  timeoutMs?: number // Custom timeout in milliseconds
) {
  for (let i = 0; i < retries; i++) {
    // Check cancellation before request
    if (signal?.aborted) {
      throw new Error('操作已取消');
    }

    try {
      // Wrap the API call with custom timeout if provided
      let result;
      if (timeoutMs && timeoutMs > 0) {
        let timeoutHandle: NodeJS.Timeout | null = null;
        let abortHandler: (() => void) | null = null;

        try {
          const promises: Promise<any>[] = [
            ai.models.generateContent(params).then((res) => {
              if (timeoutHandle) clearTimeout(timeoutHandle);
              if (abortHandler && signal) signal.removeEventListener('abort', abortHandler);
              return res;
            }),
          ];

          // Add timeout promise
          promises.push(
            new Promise((_, reject) => {
              timeoutHandle = setTimeout(
                () => reject(new Error(`请求超时 (${Math.round(timeoutMs / 1000)}秒)`)),
                timeoutMs
              );
            })
          );

          // Add signal cancellation promise
          if (signal) {
            promises.push(
              new Promise((_, reject) => {
                if (signal.aborted) {
                  reject(new Error('Operation cancelled'));
                } else {
                  abortHandler = () => reject(new Error('Operation cancelled'));
                  signal.addEventListener('abort', abortHandler);
                }
              })
            );
          }

          result = await Promise.race(promises);
        } catch (error) {
          if (timeoutHandle) clearTimeout(timeoutHandle);
          if (abortHandler && signal) signal.removeEventListener('abort', abortHandler);
          throw error;
        }
      } else {
        result = await ai.models.generateContent(params);
      }

      const candidates = (result as any).candidates;

      // Log token usage and response content
      if ((result as any).usageMetadata) {
        const usageMeta = (result as any).usageMetadata;

        // Track usage if callback provided
        if (onUsage) {
          // Extract detailed token breakdown
          let textInputTokens = 0;
          let audioInputTokens = 0;
          let cachedTokens = usageMeta.cachedContentTokenCount || 0;
          const thoughtsTokens = usageMeta.thoughtsTokenCount || 0;

          if (usageMeta.promptTokensDetails && Array.isArray(usageMeta.promptTokensDetails)) {
            for (const detail of usageMeta.promptTokensDetails) {
              if (detail.modality === 'TEXT') {
                textInputTokens = detail.tokenCount || 0;
              } else if (detail.modality === 'AUDIO') {
                audioInputTokens = detail.tokenCount || 0;
              }
            }
          }

          onUsage({
            promptTokens: usageMeta.promptTokenCount || 0,
            candidatesTokens: usageMeta.candidatesTokenCount || 0,
            totalTokens: usageMeta.totalTokenCount || 0,
            modelName: params.model || 'unknown-model',
            textInputTokens,
            audioInputTokens,
            thoughtsTokens,
            cachedTokens,
          });
        }

        // Sanitize prompt for logging (remove base64 audio data)
        const sanitizeValue = (value: any): any => {
          if (!value) return value;
          if (Array.isArray(value)) return value.map(sanitizeValue);
          if (typeof value === 'object') {
            // Check for inlineData structure
            if ('inlineData' in value && value.inlineData?.data) {
              return {
                ...value,
                inlineData: {
                  ...value.inlineData,
                  data: '<base64_audio_data_omitted>',
                },
              };
            }
            // Generic object traversal
            const newObj: any = {};
            for (const key in value) {
              newObj[key] = sanitizeValue(value[key]);
            }
            return newObj;
          }
          return value;
        };

        const sanitizedPrompt = sanitizeValue(params.contents);

        logger.debug('Gemini API Interaction', {
          request: {
            generationConfig: params.config,
            prompt: sanitizedPrompt,
          },
          response: {
            usage: usageMeta,
            content: candidates?.[0]?.content?.parts?.[0]?.text,
          },
        });
      }

      // Log grounding metadata (Search Grounding verification)
      if (candidates && candidates[0]?.groundingMetadata) {
        const groundingMeta = candidates[0].groundingMetadata;
        logger.info('🔍 Search Grounding Used', {
          searchQueries: groundingMeta.searchQueries || [],
          groundingSupports: groundingMeta.groundingSupports?.length || 0,
          webSearchQueries: groundingMeta.webSearchQueries?.length || 0,
        });
      } else if (params.tools && params.tools.some((t: any) => t.googleSearch)) {
        logger.warn('⚠️ Search Grounding was configured but NOT used in this response');
      }

      return result;
    } catch (e: any) {
      // Use comprehensive retry check (covers timeout, 429, 503, 500, network errors, JSON errors)
      if (isRetryableError(e) && i < retries - 1) {
        const delay = Math.pow(2, i) * 2000 + Math.random() * 1000; // 2s, 4s, 8s + jitter
        logger.warn(`Gemini API Error (retryable). Retrying in ${Math.round(delay)}ms...`, {
          attempt: i + 1,
          maxRetries: retries,
          error: e.message,
          status: e.status,
        });
        await new Promise((r) => setTimeout(r, delay));
      } else {
        throw e;
      }
    }
  }
  throw new Error('Gemini API 请求重试后仍然失败。');
}

export async function generateContentWithLongOutput(
  ai: GoogleGenAI,
  modelName: string,
  systemInstruction: string,
  parts: Part[],
  schema: any,
  tools?: any[],
  signal?: AbortSignal,
  onUsage?: (usage: TokenUsage) => void,
  timeoutMs?: number // Custom timeout in milliseconds
): Promise<string> {
  let fullText = '';

  // Initial message structure for chat-like behavior
  // We use an array of contents to simulate history if needed
  let messages: Content[] = [{ role: 'user', parts: parts }];

  try {
    // Check before initial generation
    if (signal?.aborted) {
      throw new Error('Operation cancelled');
    }

    // Initial generation
    logger.debug(`Generating content with model: ${modelName}`, {
      systemInstruction: systemInstruction.substring(0, 100) + '...',
    });
    let response = await generateContentWithRetry(
      ai,
      {
        model: modelName,
        contents: messages,
        config: {
          responseMimeType: 'application/json',
          responseSchema: schema,
          systemInstruction: systemInstruction,
          safetySettings: SAFETY_SETTINGS,
          maxOutputTokens: 65536,
          tools: tools, // Pass tools for Search Grounding
        },
      },
      3,
      signal,
      onUsage,
      timeoutMs
    );

    let text = response.text || '';
    fullText += text;

    // Check for truncation (finishReason or JSON parse failure)
    let attempts = 0;
    while (attempts < 3) {
      const candidate = (response as any).candidates?.[0];
      const finishReason = candidate?.finishReason;

      if (finishReason === 'MAX_TOKENS') {
        logger.warn(
          `Gemini response truncated (MAX_TOKENS). Attempt ${attempts + 1}. Fetching continuation...`
        );
      } else {
        try {
          // Try to parse the current full text
          // We remove markdown code blocks first just in case
          const clean = fullText
            .replace(/```json/g, '')
            .replace(/```/g, '')
            .trim();

          // Use robust extractor to handle extra brackets/garbage
          const extracted = extractJsonArray(clean);
          const textToParse = extracted || clean;

          JSON.parse(textToParse);

          // If parse succeeds, we are done!
          return fullText;
        } catch (e) {
          // Parse failed, likely truncated
          logger.warn(
            `JSON parse failed (attempt ${attempts + 1}). FinishReason: ${finishReason}. Assuming truncation. Fetching more...`,
            { error: e, partialText: fullText.slice(-500) } // Log tail of text
          );
        }
      }

      // Generate continuation
      // We append the current text to the history (simulated) or just ask for "continue"
      // But since we are in a single-turn or few-shot, we might need to append the response so far
      // and ask to continue.

      if (signal?.aborted) {
        throw new Error('操作已取消');
      }

      messages.push({ role: 'model', parts: [{ text: text }] });
      messages.push({
        role: 'user',
        parts: [
          { text: 'The response was truncated. Please continue exactly where you left off.' },
        ],
      });

      response = await generateContentWithRetry(
        ai,
        {
          model: modelName,
          contents: messages,
          config: {
            responseMimeType: 'application/json',
            responseSchema: schema,
            systemInstruction: systemInstruction,
            safetySettings: SAFETY_SETTINGS,
            maxOutputTokens: 65536,
          },
        },
        3,
        signal,
        onUsage,
        timeoutMs
      );

      text = response.text || '';
      fullText += text;
      attempts++;
    }

    // Final validation after all continuation attempts
    try {
      const clean = fullText
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim();
      const extracted = extractJsonArray(clean);
      const textToParse = extracted || clean;

      JSON.parse(textToParse);
      logger.debug('Final JSON validation passed');
      return fullText;
    } catch (e) {
      logger.error('Final JSON validation failed after 3 continuation attempts', {
        fullTextLength: fullText.length,
        preview: fullText.substring(0, 1000), // Increased preview to 1000 chars
        error: e,
      });
      throw new Error(`Gemini响应格式错误：经过3次续写尝试后JSON仍然无效。请稍后重试。`);
    }
  } catch (e: any) {
    logger.error('generateContentWithLongOutput failed', e);
    throw e;
  }
}
