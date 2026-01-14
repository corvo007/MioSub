import { getEnvVariable } from '@/services/utils/env';

// Centralized environment variable access
// Avoids duplicate definitions across multiple files
export const ENV = {
  GEMINI_API_KEY: getEnvVariable('GEMINI_API_KEY') || '',
  OPENAI_API_KEY: getEnvVariable('OPENAI_API_KEY') || '',
} as const;

// Re-export from models.ts for backward compatibility
export {
  MODELS,
  STEP_MODELS,
  STEP_CONFIGS,
  buildStepConfig,
  type ModelName,
  type StepName,
  type StepConfig,
} from './models';

// Subtitle visual width constraints (CJK chars count as 2, others as 1)
export const SUBTITLE_MAX_WIDTH = 65; // Max visual width before splitting
export const SUBTITLE_MIN_SPLIT_WIDTH = 20; // Minimum width after split to avoid tiny fragments

/** Maximum segment duration before splitting (seconds) */
export const MAX_SEGMENT_DURATION_SECONDS = 4;

/** Filler words to remove across all languages */
export const FILLER_WORDS = [
  // English
  'uh',
  'um',
  'ah',
  'er',
  'hmm',
  // Japanese
  'eto',
  'ano',
  'えーと',
  'あの',
  // Chinese
  '呃',
  '嗯',
  '那个',
  '就是',
];

/** Model name for display in prompts */
export const SENIOR_MODEL_NAME = 'Gemini 3 Pro Thinking';
