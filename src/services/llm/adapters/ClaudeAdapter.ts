/**
 * Claude Adapter
 * Implements ILLMAdapter for Anthropic Claude models
 */

import Anthropic from '@anthropic-ai/sdk';
import type { AdapterCapabilities, GenerateOptions, ProviderConfig } from '@/types/llm';
import { BaseAdapter } from './BaseAdapter';
import { safeParseJsonObject } from '@/services/utils/jsonParser';
import { STEP_CONFIGS, type StepName as ConfigStepName } from '@/config/models';
import { logger } from '@/services/utils/logger';
import i18n from '@/i18n';
import { findModel, parseCapabilities, type ModelCapabilities } from '../ModelCapabilities';

/**
 * Get max output tokens - uses modelCaps if available, otherwise fallback
 */
function getMaxOutputTokens(modelCaps: ModelCapabilities | null): number {
  if (modelCaps?.maxOutputTokens) {
    return modelCaps.maxOutputTokens;
  }
  // Fallback: 8192 (Claude 3.x default)
  return 8192;
}

/**
 * Claude Adapter
 * Uses native Anthropic SDK with json_only mode (schema in prompt)
 */
export class ClaudeAdapter extends BaseAdapter {
  readonly type = 'claude' as const;
  readonly model: string;

  private client: Anthropic;
  private modelCaps: ModelCapabilities | null = null;

  /**
   * Get capabilities - determined from modelCaps
   */
  get capabilities(): AdapterCapabilities {
    // Claude uses json_only by default, but 4+ supports strict via beta
    const jsonLevel = this.modelCaps?.jsonOutputLevel;
    return {
      jsonMode: jsonLevel === 'strict' ? 'full_schema' : 'json_only',
      audio: this.modelCaps?.audioInput ?? true,
      search: false, // Claude doesn't support web search
    };
  }

  /**
   * Check if model supports extended thinking - uses metadata
   * Fallback: Claude 4+ only (requires anthropic-beta header)
   */
  supportsThinking(): boolean {
    // Use metadata if available
    if (this.modelCaps) {
      return this.modelCaps.reasoning;
    }
    // Fallback: Claude 4+ supports thinking
    return /claude-[4-9]/.test(this.model) || this.model.includes('claude-4');
  }

  /**
   * Check if model supports native structured outputs (beta)
   * Claude 4+ supports output_format parameter for strict JSON schema
   */
  supportsStructuredOutputs(): boolean {
    return this.modelCaps?.jsonOutputLevel === 'strict';
  }

  constructor(config: ProviderConfig) {
    super(config);
    this.model = config.model;

    // Lookup model capabilities from models.json
    const matchResult = findModel(config.model);
    if (matchResult.model) {
      this.modelCaps = parseCapabilities(matchResult.model);
    }

    // Initialize Anthropic client
    const clientOptions: { apiKey: string; baseURL?: string } = {
      apiKey: config.apiKey,
    };

    if (config.baseUrl) {
      clientOptions.baseURL = config.baseUrl;
    }

    this.client = new Anthropic(clientOptions);
  }

  /**
   * Generate structured object response
   * Claude uses json_only mode: schema embedded in prompt + JSON output
   */
  async generateObject<T>(options: GenerateOptions): Promise<T> {
    if (!options.schema) {
      throw new Error('Schema is required for generateObject');
    }

    logger.debug(`Claude generateObject started`, {
      model: this.model,
      useWebSearch: options.useWebSearch,
      promptLength: options.prompt.length,
    });

    const messages = this.buildMessages(options);

    // Embed schema in prompt
    const schemaPrompt = this.buildSchemaPrompt(options.schema);
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && typeof lastMessage.content === 'string') {
      lastMessage.content = `${lastMessage.content}\n\n${schemaPrompt}\n\nRespond ONLY with valid JSON, no other text.`;
    }

    try {
      // Build request params (without messages)
      const requestParams: any = {
        model: this.model,
        max_tokens: getMaxOutputTokens(this.modelCaps),
        system: options.systemInstruction,
      };

      // Add web search tool if enabled
      if (this.shouldUseWebSearch(options)) {
        requestParams.tools = [
          {
            type: 'web_search_20250305',
            name: 'web_search',
          },
        ];
      }

      // Add extended thinking if configured (for Claude 4+ models)
      const extendedThinking = this.getExtendedThinking(options);
      if (extendedThinking) {
        requestParams.thinking = extendedThinking;
      }

      const content = await this.executeWithContinuation(messages, requestParams, options);
      return safeParseJsonObject<T>(content);
    } catch (error: any) {
      // Claude-specific error handling
      const actionableMessage = this.extractActionableError(error);
      if (actionableMessage) {
        logger.error('Claude generateObject failed', {
          model: this.model,
          error: actionableMessage,
        });
        throw new Error(actionableMessage);
      }
      throw error;
    }
  }

  /**
   * Extract actionable error message from Claude API error
   */
  private extractActionableError(error: any): string | undefined {
    const msg = (error.message || '').toLowerCase();
    const status = error.status;

    if (status === 401 || msg.includes('invalid api key') || msg.includes('unauthorized')) {
      return i18n.t('services:api.claude.errors.invalidKey');
    }
    if (status === 429 || msg.includes('rate limit')) {
      return i18n.t('services:api.claude.errors.rateLimited');
    }
    if (status === 403 || msg.includes('permission')) {
      return i18n.t('services:api.claude.errors.permissionDenied');
    }

    return undefined;
  }

  /**
   * Build Claude messages from options
   */
  private buildMessages(options: GenerateOptions): Anthropic.MessageParam[] {
    const messages: Anthropic.MessageParam[] = [];

    // User message with optional audio
    if (options.audio) {
      // Claude supports audio via base64 in content blocks
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: options.prompt },
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: this.getMediaType(options.audio.mimeType),
              data: options.audio.data,
            },
          },
        ],
      } as any); // Type assertion needed for document content
    } else {
      messages.push({
        role: 'user',
        content: options.prompt,
      });
    }

    return messages;
  }

  /**
   * Convert mimeType to Claude media type
   */
  private getMediaType(mimeType: string): string {
    if (mimeType.includes('wav')) return 'audio/wav';
    if (mimeType.includes('mp3')) return 'audio/mpeg';
    return mimeType;
  }

  /**
   * Build a prompt describing the expected JSON schema
   */
  private buildSchemaPrompt(schema: any): string {
    return `Please respond with JSON matching this schema:\n${JSON.stringify(schema, null, 2)}`;
  }

  /**
   * Execute request with automatic continuation for truncated responses
   * Detects stop_reason='max_tokens' and requests continuation
   */
  private async executeWithContinuation(
    messages: Anthropic.MessageParam[],
    requestParams: any,
    options: GenerateOptions,
    maxContinuations: number = 3
  ): Promise<string> {
    let fullText = '';
    let currentMessages = [...messages];
    let attempts = 0;

    while (attempts <= maxContinuations) {
      this.checkAborted(options.signal);

      const response = await this.executeWithRetry(
        () =>
          this.client.messages.create({
            ...requestParams,
            messages: currentMessages,
          }),
        {
          signal: options.signal,
          timeoutMs: options.timeoutMs,
          retries: 3,
        }
      );

      // Track usage
      if (options.onUsage && response.usage) {
        options.onUsage({
          promptTokens: response.usage.input_tokens,
          completionTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens,
        });
      }

      // Extract text from response
      const textContent = response.content.find((c) => c.type === 'text');
      const content = textContent?.type === 'text' ? textContent.text : '';
      fullText += content;

      // Check if response was truncated
      if (response.stop_reason === 'max_tokens') {
        logger.warn(
          `Claude response truncated (attempt ${attempts + 1}). Requesting continuation...`,
          {
            model: this.model,
            contentLength: fullText.length,
          }
        );

        // Add assistant's partial response and continuation request
        currentMessages.push({
          role: 'assistant',
          content: content,
        });
        currentMessages.push({
          role: 'user',
          content: 'The response was truncated. Please continue exactly where you left off.',
        });

        attempts++;
      } else {
        // Response complete
        break;
      }
    }

    if (!fullText) {
      throw new Error('Empty response from Claude');
    }

    return fullText;
  }

  /**
   * Determine if web search should be enabled based on stepName
   * Reads from STEP_CONFIGS if stepName is provided
   */
  private shouldUseWebSearch(options: GenerateOptions): boolean {
    // Explicit option takes precedence
    if (options.useWebSearch !== undefined) {
      return options.useWebSearch;
    }

    // Check STEP_CONFIGS based on stepName
    if (options.stepName) {
      const stepMapping: Record<string, ConfigStepName> = {
        refinement: 'refinement',
        translation: 'translation',
        proofread: 'batchProofread',
        speakerExtraction: 'speakerProfile',
        glossaryExtraction: 'glossaryExtraction',
      };
      const configStepName = stepMapping[options.stepName];
      if (configStepName && STEP_CONFIGS[configStepName]) {
        return STEP_CONFIGS[configStepName].useSearch ?? false;
      }
    }

    return false;
  }

  /**
   * Get extended thinking config based on stepName's thinkingLevel
   * Maps thinkingLevel to Claude's extended_thinking parameters
   * Only works with Claude 4+ models
   */
  private getExtendedThinking(
    options: GenerateOptions
  ): { type: 'enabled'; budget_tokens: number } | undefined {
    // Check model compatibility using metadata-based supportsThinking()
    if (!this.supportsThinking()) {
      return undefined;
    }

    if (!options.stepName) {
      return undefined;
    }

    const stepMapping: Record<string, ConfigStepName> = {
      refinement: 'refinement',
      translation: 'translation',
      proofread: 'batchProofread',
      speakerExtraction: 'speakerProfile',
      glossaryExtraction: 'glossaryExtraction',
    };

    const configStepName = stepMapping[options.stepName];
    if (configStepName && STEP_CONFIGS[configStepName]) {
      const thinkingLevel = STEP_CONFIGS[configStepName].thinkingLevel;
      if (thinkingLevel && thinkingLevel !== 'none') {
        // Map thinkingLevel to budget_tokens
        const budgetMap: Record<string, number> = {
          low: 4096,
          medium: 8192,
          high: 16384,
        };
        return {
          type: 'enabled',
          budget_tokens: budgetMap[thinkingLevel] || 8192,
        };
      }
    }

    return undefined;
  }
}
