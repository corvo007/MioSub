/**
 * LLM Provider Types
 * Core interfaces and types for multi-provider LLM architecture
 */

// Provider types
export type ProviderType = 'gemini' | 'openai' | 'claude';

// JSON mode capability levels
export type JsonModeCapability = 'full_schema' | 'json_only' | 'none';

/**
 * Provider configuration
 */
export interface ProviderConfig {
  type: ProviderType;
  apiKey: string;
  baseUrl?: string; // Optional, defaults to official endpoint
  model: string;
}

/**
 * Adapter capabilities
 */
export interface AdapterCapabilities {
  jsonMode: JsonModeCapability;
  audio: boolean;
  search: boolean;
}

/**
 * Token usage tracking — re-exported from api.ts (canonical definition)
 */
export type { TokenUsage } from './api';

/**
 * Audio input for multimodal requests
 */
export interface AudioInput {
  data: string; // Base64 encoded
  mimeType: string; // e.g., 'audio/wav'
}

/**
 * Options for generate methods
 */
export interface GenerateOptions {
  prompt: string;
  systemInstruction?: string;
  schema?: object;
  audio?: AudioInput;
  signal?: AbortSignal;
  onUsage?: (usage: TokenUsage) => void;
  timeoutMs?: number;
  useWebSearch?: boolean; // Enable web search grounding
  stepName?: StepName; // Step name for provider-specific config (handled internally by adapter)
}

/**
 * LLM Adapter interface
 * Each provider implements this interface
 */
export interface ILLMAdapter {
  readonly type: ProviderType;
  readonly capabilities: AdapterCapabilities;
  readonly model: string;

  /**
   * Generate structured object response
   * Handles schema-based output with automatic degradation for unsupported providers
   */
  generateObject<T>(options: GenerateOptions): Promise<T>;
}

/**
 * Cached capability info for OpenAI compatible providers
 */
export interface CachedCapability {
  jsonMode: JsonModeCapability;
  probedAt: number; // Timestamp
}

/**
 * Step names for per-step provider configuration
 */
export type StepName =
  | 'refinement'
  | 'translation'
  | 'proofread'
  | 'speakerExtraction'
  | 'glossaryExtraction';

/**
 * Per-step provider configuration
 */
export type StepProviders = Partial<Record<StepName, ProviderConfig>>;

/**
 * Check if a model name is an official OpenAI model
 */
export function isOfficialOpenAIModel(model: string): boolean {
  return /^(gpt-|o[0-9]|chatgpt-)/i.test(model);
}
