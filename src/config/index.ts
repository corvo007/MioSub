import { getEnvVariable } from '@/services/utils/env';

// Centralized environment variable access
// Avoids duplicate definitions across multiple files
export const ENV = {
  GEMINI_API_KEY: getEnvVariable('GEMINI_API_KEY') || '',
  OPENAI_API_KEY: getEnvVariable('OPENAI_API_KEY') || '',
} as const;

// Model constants
export const MODELS = {
  FLASH: 'gemini-2.5-flash',
  PRO: 'gemini-3-pro-preview',
} as const;

export type ModelName = (typeof MODELS)[keyof typeof MODELS];
