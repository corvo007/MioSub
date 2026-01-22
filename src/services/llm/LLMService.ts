/**
 * LLM Service
 * Routes requests to the appropriate adapter based on step configuration
 */

import type { ProviderConfig, ILLMAdapter, StepName, StepProviders } from '@/types/llm';
import type { AppSettings } from '@/types/settings';
import { STEP_MODELS } from '@/config/models';
import { GeminiAdapter } from './adapters/GeminiAdapter';
import { OpenAIAdapter } from './adapters/OpenAIAdapter';
import { ClaudeAdapter } from './adapters/ClaudeAdapter';
import i18n from '@/i18n';

/**
 * LLM Service singleton
 * Manages adapter instances and routes requests based on configuration
 */
class LLMServiceClass {
  private adapters = new Map<string, ILLMAdapter>();

  /**
   * Get or create an adapter for the specified step
   */
  getAdapterForStep(stepName: StepName, settings: AppSettings): ILLMAdapter {
    const config = this.getProviderConfig(stepName, settings);
    return this.getOrCreateAdapter(config);
  }

  /**
   * Get provider config for a step, with fallback to defaults
   */
  private getProviderConfig(stepName: StepName, settings: AppSettings): ProviderConfig {
    // Check if per-step config exists
    const stepProviders = settings.stepProviders as StepProviders | undefined;
    const stepConfig = stepProviders?.[stepName];

    if (stepConfig) {
      return stepConfig;
    }

    // Default to Gemini with existing settings
    return {
      type: 'gemini',
      apiKey: settings.geminiKey,
      baseUrl: settings.geminiEndpoint,
      model: this.getDefaultModelForStep(stepName),
    };
  }

  /**
   * Get default model name for a step (from config/models.ts)
   * Maps LLM StepName to config StepName where they differ
   */
  private getDefaultModelForStep(stepName: StepName): string {
    // Map LLM step names to config step names
    const stepMapping: Record<StepName, keyof typeof STEP_MODELS> = {
      refinement: 'refinement',
      translation: 'translation',
      proofread: 'batchProofread',
      speakerExtraction: 'speakerProfile',
      glossaryExtraction: 'glossaryExtraction',
    };

    const configStepName = stepMapping[stepName];
    return STEP_MODELS[configStepName] || 'gemini-2.5-flash';
  }

  /**
   * Get or create adapter instance (cached by config key)
   */
  private getOrCreateAdapter(config: ProviderConfig): ILLMAdapter {
    const key = this.getAdapterKey(config);

    if (!this.adapters.has(key)) {
      const adapter = this.createAdapter(config);
      this.adapters.set(key, adapter);
    }

    return this.adapters.get(key)!;
  }

  /**
   * Generate unique key for adapter caching
   * Includes apiKey fingerprint to ensure new adapter is created when key changes
   */
  private getAdapterKey(config: ProviderConfig): string {
    // Use first 8 chars of apiKey as fingerprint (enough to detect changes, safe for logs)
    const keyFingerprint = config.apiKey ? config.apiKey.substring(0, 8) : 'no-key';
    return `${config.type}:${config.baseUrl || 'default'}:${config.model}:${keyFingerprint}`;
  }

  /**
   * Create adapter instance based on provider type
   */
  private createAdapter(config: ProviderConfig): ILLMAdapter {
    switch (config.type) {
      case 'gemini':
        return new GeminiAdapter(config);

      case 'openai':
        return new OpenAIAdapter(config);

      case 'claude':
        return new ClaudeAdapter(config);

      default:
        throw new Error(i18n.t('services:api.errors.unknownProvider', { type: config.type }));
    }
  }

  /**
   * Clear all cached adapters
   */
  clearCache(): void {
    this.adapters.clear();
  }

  /**
   * Remove a specific adapter from cache
   */
  removeAdapter(config: ProviderConfig): void {
    const key = this.getAdapterKey(config);
    this.adapters.delete(key);
  }
}

// Export singleton instance
export const llmService = new LLMServiceClass();
