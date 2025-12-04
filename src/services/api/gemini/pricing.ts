import { TokenUsage } from '@/types/api';

/**
 * Official Gemini API Pricing (as of Nov 2024)
 * All prices in USD per 1 Million Tokens
 * 
 * Reference: https://ai.google.dev/gemini-api/docs/pricing
 */

export interface ModelPricing {
    // Input pricing
    textInput: number;          // Text/Image/Video per 1M tokens
    audioInput: number;         // Audio per 1M tokens
    // Input pricing for high context (>200k tokens) - only for Pro models
    textInputHighContext?: number;
    audioInputHighContext?: number;
    // Output pricing
    output: number;             // Output (including thinking) per 1M tokens
    outputHighContext?: number; // Output for >200k context
    // Cache pricing
    cacheText?: number;         // Cached text/image/video per 1M tokens
    cacheAudio?: number;        // Cached audio per 1M tokens
    cacheTextHighContext?: number;
    cacheAudioHighContext?: number;
}

// Context threshold for tiered pricing (Pro models)
const HIGH_CONTEXT_THRESHOLD = 200_000;

export const GEMINI_PRICING: Record<string, ModelPricing> = {
    // Gemini 2.5 Flash - Standard Tier
    // Text/Image/Video: $0.30, Audio: $1.00, Output: $2.50
    // Cache: Text $0.03, Audio $0.10
    'gemini-2.5-flash': {
        textInput: 0.30,
        audioInput: 1.00,
        output: 2.50,
        cacheText: 0.03,
        cacheAudio: 0.10
    },

    // Gemini 3 Pro Preview - Standard Tier
    // Input: $2.00 (<=200k), $4.00 (>200k) - No audio differentiation
    // Output: $12.00 (<=200k), $18.00 (>200k)
    // Cache: $0.20 (<=200k), $0.40 (>200k)
    'gemini-3-pro-preview': {
        textInput: 2.00,
        audioInput: 2.00,  // Same as text for Pro
        textInputHighContext: 4.00,
        audioInputHighContext: 4.00,
        output: 12.00,
        outputHighContext: 18.00,
        cacheText: 0.20,
        cacheAudio: 0.20,
        cacheTextHighContext: 0.40,
        cacheAudioHighContext: 0.40
    },

    // Fallback for unknown models
    'default': {
        textInput: 0,
        audioInput: 0,
        output: 0
    }
};

/**
 * Calculate cost based on detailed token usage with modality breakdown.
 * Supports:
 * - Text vs Audio input differentiation
 * - Context length tiers (<=200k vs >200k)
 * - Cached token pricing
 * - Thinking tokens (billed as output)
 */
export const calculateDetailedCost = (usage: {
    textInputTokens?: number;
    audioInputTokens?: number;
    candidatesTokens: number;
    thoughtsTokens?: number;
    cachedTokens?: number;
    modelName: string;
}): number => {
    const model = usage.modelName;
    let pricing = GEMINI_PRICING[model];

    // Fallback to model family if exact match not found
    if (!pricing) {
        if (model.includes('flash')) {
            pricing = GEMINI_PRICING['gemini-2.5-flash'];
        } else if (model.includes('pro')) {
            pricing = GEMINI_PRICING['gemini-3-pro-preview'];
        } else {
            pricing = GEMINI_PRICING['default'];
        }
    }

    const textInput = usage.textInputTokens || 0;
    const audioInput = usage.audioInputTokens || 0;
    const output = usage.candidatesTokens || 0;
    const thoughts = usage.thoughtsTokens || 0;
    const cached = usage.cachedTokens || 0;

    // Total input tokens to determine context tier
    const totalInputTokens = textInput + audioInput;
    const isHighContext = totalInputTokens > HIGH_CONTEXT_THRESHOLD;

    // Select appropriate rates based on context tier
    const textRate = isHighContext && pricing.textInputHighContext
        ? pricing.textInputHighContext
        : pricing.textInput;
    const audioRate = isHighContext && pricing.audioInputHighContext
        ? pricing.audioInputHighContext
        : pricing.audioInput;
    const outputRate = isHighContext && pricing.outputHighContext
        ? pricing.outputHighContext
        : pricing.output;
    const cacheTextRate = isHighContext && pricing.cacheTextHighContext
        ? pricing.cacheTextHighContext
        : pricing.cacheText || 0;
    const cacheAudioRate = isHighContext && pricing.cacheAudioHighContext
        ? pricing.cacheAudioHighContext
        : pricing.cacheAudio || 0;

    // Calculate costs
    const textInputCost = (textInput / 1_000_000) * textRate;
    const audioInputCost = (audioInput / 1_000_000) * audioRate;
    const outputCost = ((output + thoughts) / 1_000_000) * outputRate;

    // For cached tokens, we assume they are primarily text (most common use case)
    // A more accurate implementation would track cached audio separately
    const cacheCost = (cached / 1_000_000) * cacheTextRate;

    return textInputCost + audioInputCost + outputCost + cacheCost;
};

/**
 * Legacy function for backward compatibility.
 * Assumes all prompt tokens are text input.
 */
export const calculateCost = (model: string, promptTokens: number, outputTokens: number): number => {
    return calculateDetailedCost({
        textInputTokens: promptTokens,
        audioInputTokens: 0,
        candidatesTokens: outputTokens,
        thoughtsTokens: 0,
        cachedTokens: 0,
        modelName: model
    });
};
