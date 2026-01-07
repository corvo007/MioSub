// Step-specific model configuration
// This allows customizing which model to use for each processing step
// without exposing this to the UI

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

  // Batch Fix Timestamps: Timeline correction
  batchFixTimestamps: MODELS.FLASH,
} as const;

export type StepName = keyof typeof STEP_MODELS;

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
    thinkingLevel: 'medium',
    useSearch: false,
    maxOutputTokens: 65536,
  },

  translation: {
    thinkingLevel: 'medium',
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
    maxOutputTokens: 8192,
  },

  batchProofread: {
    thinkingLevel: 'high',
    useSearch: true,
    maxOutputTokens: 65536,
  },

  batchFixTimestamps: {
    thinkingLevel: 'medium',
    useSearch: false,
    maxOutputTokens: 65536,
  },
};

// Helper to build config object for API calls
export function buildStepConfig(step: StepName) {
  const config = STEP_CONFIGS[step];
  return {
    maxOutputTokens: config.maxOutputTokens ?? 65536,
    ...(config.useSearch && { tools: [{ googleSearch: {} }] }),
    ...(config.thinkingLevel &&
      config.thinkingLevel !== 'none' && {
        thinkingConfig: { thinkingLevel: config.thinkingLevel },
      }),
  };
}
