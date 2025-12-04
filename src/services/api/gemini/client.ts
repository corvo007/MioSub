import { GoogleGenAI, Part, Content } from "@google/genai";
import { logger } from "@/services/utils/logger";
import { SAFETY_SETTINGS } from "./schemas";
import { extractJsonArray } from "@/services/subtitle/parser";
import { TokenUsage } from "@/types/api";

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

export function isRetryableError(error: any): boolean {
    if (!error) return false;

    const status = error.status || error.response?.status;
    const msg = error.message || '';
    const code = error.code || '';

    // Timeout errors
    if (code === 'ETIMEDOUT' || code === 'ECONNABORTED' ||
        code === 'ENOTFOUND' || // DNS resolution failed
        msg.includes('timeout') ||
        msg.includes('timed out') ||
        msg.toLowerCase().includes('timeout')) {
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

    // Network errors (fetch failed)
    if (msg.includes('fetch failed') || msg.includes('network') || msg.includes('ECONNREFUSED')) {
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
            throw new Error('Operation cancelled');
        }

        try {
            // Wrap the API call with custom timeout if provided
            let result;
            if (timeoutMs && timeoutMs > 0) {
                let timeoutHandle: NodeJS.Timeout | null = null;
                try {
                    result = await Promise.race([
                        ai.models.generateContent(params).then(res => {
                            // Clear timeout when request succeeds
                            if (timeoutHandle) clearTimeout(timeoutHandle);
                            return res;
                        }),
                        new Promise((_, reject) => {
                            timeoutHandle = setTimeout(() => reject(new Error(`Request timeout after ${timeoutMs}ms`)), timeoutMs);
                        })
                    ]);
                } catch (error) {
                    // Clear timeout on error as well
                    if (timeoutHandle) clearTimeout(timeoutHandle);
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
                    onUsage({
                        promptTokens: usageMeta.promptTokenCount || 0,
                        candidatesTokens: usageMeta.candidatesTokenCount || 0,
                        totalTokens: usageMeta.totalTokenCount || 0,
                        modelName: params.model || 'unknown-model'
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
                                    data: '<base64_audio_data_omitted>'
                                }
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

                logger.debug("Gemini API Interaction", {
                    request: {
                        generationConfig: params.config,
                        prompt: sanitizedPrompt
                    },
                    response: {
                        usage: usageMeta,
                        content: candidates?.[0]?.content?.parts?.[0]?.text
                    }
                });
            }

            // Log grounding metadata (Search Grounding verification)
            if (candidates && candidates[0]?.groundingMetadata) {
                const groundingMeta = candidates[0].groundingMetadata;
                logger.info("🔍 Search Grounding Used", {
                    searchQueries: groundingMeta.searchQueries || [],
                    groundingSupports: groundingMeta.groundingSupports?.length || 0,
                    webSearchQueries: groundingMeta.webSearchQueries?.length || 0
                });
            } else if (params.tools && params.tools.some((t: any) => t.googleSearch)) {
                logger.warn("⚠️ Search Grounding was configured but NOT used in this response");
            }

            return result;
        } catch (e: any) {
            // Check for 429 (Resource Exhausted) or 503 (Service Unavailable)
            const isRateLimit = e.status === 429 || e.message?.includes('429') || e.response?.status === 429;
            const isServerOverload = e.status === 503 || e.message?.includes('503');

            if ((isRateLimit || isServerOverload) && i < retries - 1) {
                const delay = Math.pow(2, i) * 2000 + Math.random() * 1000; // 2s, 4s, 8s + jitter
                logger.warn(`Gemini API Busy (${e.status}). Retrying in ${Math.round(delay)}ms...`, { attempt: i + 1, error: e.message });
                await new Promise(r => setTimeout(r, delay));
            } else {
                throw e;
            }
        }
    }
    throw new Error("Gemini API 请求重试后仍然失败。");
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
    let fullText = "";

    // Initial message structure for chat-like behavior
    // We use an array of contents to simulate history if needed
    let messages: Content[] = [
        { role: 'user', parts: parts }
    ];

    try {
        // Check before initial generation
        if (signal?.aborted) {
            throw new Error('Operation cancelled');
        }

        // Initial generation
        logger.debug(`Generating content with model: ${modelName}`, { systemInstruction: systemInstruction.substring(0, 100) + "..." });
        let response = await generateContentWithRetry(ai, {
            model: modelName,
            contents: messages,
            config: {
                responseMimeType: "application/json",
                responseSchema: schema,
                systemInstruction: systemInstruction,
                safetySettings: SAFETY_SETTINGS,
                maxOutputTokens: 65536,
                tools: tools, // Pass tools for Search Grounding
            }
        }, 3, signal, onUsage, timeoutMs);

        let text = response.text || "";
        fullText += text;

        // Check for truncation (finishReason or JSON parse failure)
        let attempts = 0;
        while (attempts < 3) {
            const candidate = (response as any).candidates?.[0];
            const finishReason = candidate?.finishReason;

            if (finishReason === 'MAX_TOKENS') {
                logger.warn(`Gemini response truncated (MAX_TOKENS). Attempt ${attempts + 1}. Fetching continuation...`);
            } else {
                try {
                    // Try to parse the current full text
                    // We remove markdown code blocks first just in case
                    const clean = fullText.replace(/```json/g, '').replace(/```/g, '').trim();

                    // Use robust extractor to handle extra brackets/garbage
                    const extracted = extractJsonArray(clean);
                    const textToParse = extracted || clean;

                    JSON.parse(textToParse);

                    // If parse succeeds, we are done!
                    return fullText;
                } catch (e) {
                    // Parse failed, likely truncated
                    logger.warn(`JSON parse failed (attempt ${attempts + 1}). FinishReason: ${finishReason}. Assuming truncation. Fetching more...`);
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
            messages.push({ role: 'user', parts: [{ text: "The response was truncated. Please continue exactly where you left off." }] });

            response = await generateContentWithRetry(ai, {
                model: modelName,
                contents: messages,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: schema,
                    systemInstruction: systemInstruction,
                    safetySettings: SAFETY_SETTINGS,
                    maxOutputTokens: 65536,
                }
            }, 3, signal, onUsage, timeoutMs);

            text = response.text || "";
            fullText += text;
            attempts++;
        }

        // Final validation after all continuation attempts
        try {
            const clean = fullText.replace(/```json/g, '').replace(/```/g, '').trim();
            const extracted = extractJsonArray(clean);
            const textToParse = extracted || clean;

            JSON.parse(textToParse);
            logger.debug("Final JSON validation passed");
            return fullText;
        } catch (e) {
            logger.error("Final JSON validation failed after 3 continuation attempts", {
                fullTextLength: fullText.length,
                preview: fullText.substring(0, 200),
                error: e
            });
            throw new Error(`Gemini响应格式错误：经过3次续写尝试后JSON仍然无效。请稍后重试。`);
        }

    } catch (e: any) {
        logger.error("generateContentWithLongOutput failed", e);
        throw e;
    }
}
