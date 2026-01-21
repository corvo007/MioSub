/**
 * LLM Model Configuration
 *
 * This module provides centralized configuration for LLM model selection
 * and step-specific parameters. The configuration is provider-agnostic at
 * the step level—adapters handle the translation to provider-specific APIs.
 *
 * Architecture:
 * - STEP_MODELS: Maps pipeline steps to Gemini models (fallback defaults)
 * - STEP_CONFIGS: Step-level feature toggles (thinking, search, output limits)
 * - buildStepConfig: Gemini-specific API parameter builder
 */

import { SAFETY_SETTINGS } from '@/services/llm/schemas';

// =============================================================================
// Model Definitions
// =============================================================================

/**
 * Available Gemini models
 * Used as default values when no per-step provider is configured
 */
export const MODELS = {
  /** Gemini 2.5 Flash - Fast, reliable, good for refinement */
  FLASH: 'gemini-2.5-flash',
  /** Gemini 3 Flash Preview - Latest fast model */
  FLASH_NEW: 'gemini-3-flash-preview',
  /** Gemini 3 Pro Preview - Best quality reasoning */
  PRO: 'gemini-3-pro-preview',
} as const;

export type ModelName = (typeof MODELS)[keyof typeof MODELS];

// =============================================================================
// Step-to-Model Mapping
// =============================================================================

/**
 * Default Gemini model for each pipeline step
 * These are used when AppSettings.stepProviders doesn't specify a provider
 */
export const STEP_MODELS = {
  /**
   * Refinement: Audio → Timestamp correction + transcript polish
   * ⚠️ Uses 2.5 Flash due to Gemini 3 timestamp compression bug (2024-12-16)
   */
  refinement: MODELS.FLASH,

  /** Translation: Multi-language text translation */
  translation: MODELS.FLASH_NEW,

  /** Glossary Extraction: Extract domain terminology from audio/text */
  glossaryExtraction: MODELS.PRO,

  /** Speaker Profile: Identify and analyze speakers from audio */
  speakerProfile: MODELS.PRO,

  /** Batch Proofread: High-quality multi-pass proofreading */
  batchProofread: MODELS.PRO,
} as const;

export type StepName = keyof typeof STEP_MODELS;

// =============================================================================
// Step Configuration Types
// =============================================================================

/**
 * Thinking intensity level
 * Mapped to provider-specific parameters by each adapter:
 * - Gemini 2.5: thinkingBudget (4096/8192/16384 tokens)
 * - Gemini 3: thinkingLevel ("low"/"medium"/"high")
 * - OpenAI: reasoning_effort ("low"/"medium"/"high") - only o-series/gpt-5
 * - Claude: budget_tokens (4096/8192/16384 tokens) - only Claude 4+
 */
export type ThinkingLevel = 'none' | 'low' | 'medium' | 'high';

/**
 * Step-level configuration
 * Provider-agnostic settings that adapters translate to API parameters
 */
export interface StepConfig {
  /**
   * Thinking/reasoning intensity
   * Set to 'none' or omit to disable extended thinking
   */
  thinkingLevel?: ThinkingLevel;

  /**
   * Enable web search grounding
   * - Gemini: Google Search tool
   * - OpenAI: web_search_options (official models only)
   * - Claude: web_search tool (Claude 4+)
   */
  useSearch?: boolean;
}

// =============================================================================
// Step Configurations
// =============================================================================

/**
 * Configuration for each pipeline step
 * These settings are read by adapters to construct API requests
 */
export const STEP_CONFIGS: Record<StepName, StepConfig> = {
  /**
   * Refinement (Audio processing)
   * - No thinking: Speed priority for real-time feedback
   * - No search: Audio content doesn't benefit from web grounding
   */
  refinement: {
    thinkingLevel: 'none',
    useSearch: false,
  },

  /**
   * Translation
   * - No thinking: Streaming UX priority
   * - Search enabled: Helps with proper nouns, terminology
   */
  translation: {
    thinkingLevel: 'none',
    useSearch: true,
  },

  /**
   * Glossary Extraction
   * - High thinking: Complex terminology analysis
   * - Search enabled: Verify terminology accuracy
   */
  glossaryExtraction: {
    thinkingLevel: 'high',
    useSearch: true,
  },

  /**
   * Speaker Profile
   * - High thinking: Complex speaker identification
   * - Search enabled: Could help identify known speakers
   */
  speakerProfile: {
    thinkingLevel: 'high',
    useSearch: true,
  },

  /**
   * Batch Proofread
   * - High thinking: Quality-focused multi-pass review
   * - Search enabled: Fact-checking and terminology verification
   */
  batchProofread: {
    thinkingLevel: 'high',
    useSearch: true,
  },
};

// =============================================================================
// Gemini API Helpers
// =============================================================================

/**
 * Build Gemini-specific API configuration for a step
 * Used by GeminiAdapter to construct generateContent parameters
 *
 * @param step - Pipeline step name
 * @returns Gemini API configuration object
 */
export function buildStepConfig(step: StepName) {
  const config = STEP_CONFIGS[step];

  return {
    // Common Gemini parameters
    responseMimeType: 'application/json' as const,
    safetySettings: SAFETY_SETTINGS,

    // Google Search tool (if enabled)
    ...(config.useSearch && { tools: [{ googleSearch: {} }] }),

    // Thinking config (if enabled)
    // Note: GeminiAdapter further transforms this based on model version
    ...(config.thinkingLevel &&
      config.thinkingLevel !== 'none' && {
        thinkingConfig: { thinkingLevel: config.thinkingLevel },
      }),
  };
}
