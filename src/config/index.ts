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
