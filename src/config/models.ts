// Step-specific model configuration
// This allows customizing which model to use for each processing step
// without exposing this to the UI

import { SAFETY_SETTINGS } from '@/services/llm/schemas';

// Base model definitions
export const MODELS = {
  FLASH: 'gemini-2.5-flash',
  FLASH_NEW: 'gemini-3-flash-preview',
  PRO: 'gemini-3-pro-preview',
} as const;

export type ModelName = (typeof MODELS)[keyof typeof MODELS];

// Step-to-model mapping
// Change these values to switch models for specific steps
export const STEP_MODELS = {
  // Refinement: Audio -> Timestamp correction + transcript polish
  // ⚠️ Gemini 3 Flash 存在时间戳压缩 Bug (2024-12-16)
  // 使用 2.5 Flash 直到问题修复
  refinement: MODELS.FLASH,

  // Translation: Text translation
  translation: MODELS.FLASH_NEW,

  // Glossary Extraction: Extract terminology from audio
  glossaryExtraction: MODELS.PRO,

  // Speaker Profile: Identify and analyze speakers
  speakerProfile: MODELS.PRO,

  // Batch Proofread: High quality proofreading
  batchProofread: MODELS.PRO,
} as const;

export type StepName = keyof typeof STEP_MODELS;

// ============================================================================
// Runtime model overrides (user-configured, Gemini-only)
// ----------------------------------------------------------------------------
// STEP_MODELS above are the built-in defaults. Users can override the model
// name per step via Settings. Because the model id is read at many call sites
// that do NOT receive the settings object, we keep the active overrides in
// module-level state (synced from the settings store) and expose a resolver.
// This mirrors the existing module-constant pattern and guarantees the
// override reaches every pipeline path.
//
// NOTE: This is renderer-only state, intentionally synced from the settings
// store (see setGeminiModelOverrides callers in useAppStore). If unit tests
// are ever added, reset it between tests via setGeminiModelOverrides(undefined)
// to avoid cross-test contamination.
// ============================================================================

let stepModelOverrides: Partial<Record<StepName, string>> = {};

/**
 * Validate that a model id belongs to the Gemini series.
 * Every Gemini model id contains the "gemini" keyword (case-insensitive),
 * e.g. "gemini-2.5-flash", "gemini-3-pro-preview". The whole pipeline relies
 * on Gemini-specific API features, so non-Gemini ids are rejected.
 */
export function isGeminiModel(name: string): boolean {
  return typeof name === 'string' && /gemini/i.test(name.trim());
}

/**
 * Sync user overrides into the resolver. Called from the settings store on
 * load and whenever the override map changes. Empty or non-Gemini values are
 * ignored (defensive — the UI also validates before saving).
 */
export function setGeminiModelOverrides(overrides?: Partial<Record<StepName, string>>): void {
  const next: Partial<Record<StepName, string>> = {};
  if (overrides) {
    for (const step of Object.keys(STEP_MODELS) as StepName[]) {
      const value = overrides[step]?.trim();
      if (value && isGeminiModel(value)) {
        next[step] = value;
      }
    }
  }
  stepModelOverrides = next;
}

/**
 * Resolve the active model id for a step: the user override if set and valid,
 * otherwise the built-in default. Use this instead of reading STEP_MODELS
 * directly at API call sites.
 */
export function getStepModel(step: StepName): string {
  return stepModelOverrides[step] || STEP_MODELS[step];
}

// ============================================================================
// Step-specific model configurations
// Configure thinking, tools, and output limits for each step
// ============================================================================

type ThinkingLevel = 'none' | 'low' | 'medium' | 'high';

export interface StepConfig {
  // Thinking configuration (for models that support it)
  thinkingLevel?: ThinkingLevel;
  // Enable Google Search grounding
  useSearch?: boolean;
  // Max output tokens (default: 65536)
  maxOutputTokens?: number;
}

export const STEP_CONFIGS: Record<StepName, StepConfig> = {
  refinement: {
    // thinkingLevel: 'high',
    useSearch: false,
    maxOutputTokens: 65536,
  },

  translation: {
    // thinkingLevel: 'high',
    useSearch: true,
    maxOutputTokens: 65536,
  },

  glossaryExtraction: {
    thinkingLevel: 'high',
    useSearch: true,
    maxOutputTokens: 65536,
  },

  speakerProfile: {
    thinkingLevel: 'high',
    useSearch: true,
    maxOutputTokens: 65536,
  },

  batchProofread: {
    thinkingLevel: 'high',
    useSearch: true,
    maxOutputTokens: 65536,
  },
};

// Helper to build config object for API calls
// Includes common parameters used by all Gemini API calls
export function buildStepConfig(step: StepName) {
  const config = STEP_CONFIGS[step];
  return {
    // Common parameters for all API calls
    responseMimeType: 'application/json' as const,
    safetySettings: SAFETY_SETTINGS,
    maxOutputTokens: config.maxOutputTokens ?? 65536,
    // Step-specific parameters
    ...(config.useSearch && { tools: [{ googleSearch: {} }] }),
    ...(config.thinkingLevel &&
      config.thinkingLevel !== 'none' && {
        thinkingConfig: { thinkingLevel: config.thinkingLevel },
      }),
  };
}
