/**
 * Gemini Adapter
 * Implements ILLMAdapter for Google Gemini models
 */

import { GoogleGenAI, type Part } from '@google/genai';
import type { AdapterCapabilities, GenerateOptions, TokenUsage, ProviderConfig } from '@/types/llm';
import { BaseAdapter } from './BaseAdapter';
import {
  generateContentWithLongOutput,
  getActionableErrorMessage,
} from '@/services/llm/providers/gemini';
import { buildStepConfig, type StepName as ConfigStepName } from '@/config/models';
import { safeParseJsonObject } from '@/services/utils/jsonParser';
import { logger } from '@/services/utils/logger';
import { findModel, parseCapabilities, type ModelCapabilities } from '../ModelCapabilities';

/**
 * Get max output tokens - uses modelCaps if available, otherwise fallback
 */
function getMaxOutputTokens(modelCaps: ModelCapabilities | null): number {
  if (modelCaps?.maxOutputTokens) {
    return modelCaps.maxOutputTokens;
  }
  // Fallback: 65536 (Gemini default)
  return 65536;
}

/**
 * Gemini Adapter
 * Wraps existing Gemini client code with ILLMAdapter interface
 */
export class GeminiAdapter extends BaseAdapter {
  readonly type = 'gemini' as const;
  readonly model: string;

  private ai: GoogleGenAI;
  private modelCaps: ModelCapabilities | null = null;

  /**
   * Get capabilities - determined from modelCaps
   */
  get capabilities(): AdapterCapabilities {
    return {
      jsonMode: 'full_schema',
      audio: this.modelCaps?.audioInput ?? true,
      search: this.modelCaps?.webSearch ?? true,
    };
  }

  constructor(config: ProviderConfig) {
    super(config);
    this.model = config.model;

    // Lookup model capabilities from models.json
    const matchResult = findModel(config.model);
    if (matchResult.model) {
      this.modelCaps = parseCapabilities(matchResult.model);
    }

    // Initialize Gemini client
    const clientOptions: { apiKey: string; baseUrl?: string } = {
      apiKey: config.apiKey,
    };

    if (config.baseUrl) {
      clientOptions.baseUrl = config.baseUrl;
    }

    this.ai = new GoogleGenAI(clientOptions);
  }

  /**
   * Generate structured object response
   */
  async generateObject<T>(options: GenerateOptions): Promise<T> {
    if (!options.schema) {
      throw new Error('Schema is required for generateObject');
    }

    const parts = this.buildParts(options);

    // Build config from stepName if provided, otherwise use defaults
    const stepConfig: ReturnType<typeof buildStepConfig> | Record<string, never> = options.stepName
      ? this.getStepConfig(options.stepName)
      : {};

    // Transform thinkingConfig based on model version
    const thinkingConfig = this.getThinkingConfig(stepConfig.thinkingConfig);

    try {
      // Use executeWithRetry for consistent retry/timeout handling
      const text = await this.executeWithRetry(
        () =>
          generateContentWithLongOutput(
            this.ai,
            this.model,
            options.systemInstruction || '',
            parts,
            options.schema,
            {
              maxOutputTokens: getMaxOutputTokens(this.modelCaps),
              // Pass through Gemini-specific settings from step config
              ...(stepConfig.safetySettings && { safetySettings: stepConfig.safetySettings }),
              ...(stepConfig.tools && { tools: stepConfig.tools }),
              ...(thinkingConfig && { thinkingConfig }),
            },
            options.signal,
            options.onUsage ? (usage: any) => this.mapUsage(usage, options.onUsage!) : undefined
          ),
        {
          signal: options.signal,
          timeoutMs: options.timeoutMs,
          retries: 3,
        }
      );

      return safeParseJsonObject<T>(text);
    } catch (error: any) {
      // Extract actionable error message if available
      const actionableMessage = getActionableErrorMessage(error);
      if (actionableMessage) {
        logger.error('Gemini generateObject failed with actionable error', {
          actionableMessage,
          originalError: error.message,
        });
        throw new Error(actionableMessage);
      }
      throw error;
    }
  }

  /**
   * Build parts array for Gemini API
   */
  private buildParts(options: GenerateOptions): Part[] {
    const parts: Part[] = [{ text: options.prompt }];

    // Add audio if provided
    if (options.audio) {
      parts.push({
        inlineData: {
          mimeType: options.audio.mimeType,
          data: options.audio.data,
        },
      });
    }

    return parts;
  }

  /**
   * Map Gemini usage to standard TokenUsage
   */
  private mapUsage(geminiUsage: any, callback: (usage: TokenUsage) => void): void {
    callback({
      promptTokens: geminiUsage.promptTokens || 0,
      completionTokens: geminiUsage.candidatesTokens || 0,
      totalTokens: geminiUsage.totalTokens || 0,
    });
  }

  /**
   * Get step config from buildStepConfig helper
   * Maps LLM StepName to Config StepName
   */
  private getStepConfig(stepName: string): ReturnType<typeof buildStepConfig> {
    // Map LLM step names to config step names
    const stepMapping: Record<string, ConfigStepName> = {
      refinement: 'refinement',
      translation: 'translation',
      proofread: 'batchProofread',
      speakerExtraction: 'speakerProfile',
      glossaryExtraction: 'glossaryExtraction',
    };

    const configStepName = stepMapping[stepName] || 'refinement';
    return buildStepConfig(configStepName);
  }

  /**
   * Transform thinkingConfig based on model version
   * Gemini 2.5: use thinkingBudget (token count)
   * Gemini 3: use thinkingLevel (low/medium/high)
   */
  private getThinkingConfig(originalConfig?: {
    thinkingLevel?: string;
  }): { thinkingLevel?: string; thinkingBudget?: number } | undefined {
    if (!originalConfig?.thinkingLevel) return undefined;
    if (originalConfig.thinkingLevel === 'none') return undefined;

    // Skip for lite models
    if (this.model.includes('lite')) return undefined;

    const level = originalConfig.thinkingLevel as 'low' | 'medium' | 'high';

    if (this.model.includes('2.5')) {
      // Gemini 2.5: convert to thinkingBudget
      const budgetMap = { low: 4096, medium: 8192, high: 16384 };
      return { thinkingBudget: budgetMap[level] || 8192 };
    } else {
      // Gemini 3+: use thinkingLevel directly
      return { thinkingLevel: level };
    }
  }
}
