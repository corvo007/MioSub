import { type TokenUsage } from '@/types/api';
import { calculateDetailedCost } from '@/services/llm/pricing';
import { logger } from '@/services/utils/logger';

interface ModelUsage {
  prompt: number;
  output: number;
  total: number;
  textInput: number;
  audioInput: number;
  thoughts: number;
  cached: number;
}

/**
 * Centralized token usage tracking and reporting
 */
export class UsageReporter {
  private usageReport: Record<string, ModelUsage> = {};

  /**
   * Track usage from a single API call
   */
  track(usage: TokenUsage): void {
    const model = usage.modelName;
    if (!this.usageReport[model]) {
      this.usageReport[model] = {
        prompt: 0,
        output: 0,
        total: 0,
        textInput: 0,
        audioInput: 0,
        thoughts: 0,
        cached: 0,
      };
    }
    this.usageReport[model].prompt += usage.promptTokens;
    this.usageReport[model].output += usage.candidatesTokens;
    this.usageReport[model].total += usage.totalTokens;
    this.usageReport[model].textInput += usage.textInputTokens || 0;
    this.usageReport[model].audioInput += usage.audioInputTokens || 0;
    this.usageReport[model].thoughts += usage.thoughtsTokens || 0;
    this.usageReport[model].cached += usage.cachedTokens || 0;
  }

  /**
   * Get the track function bound to this instance (for passing to API calls)
   */
  getTracker(): (usage: TokenUsage) => void {
    return (usage: TokenUsage) => this.track(usage);
  }

  /**
   * Log the final usage report with cost calculation
   */
  logReport(): void {
    let reportLog = '\n📊 Token Usage Report:\n----------------------------------------\n';
    let grandTotal = 0;
    let totalCost = 0;

    for (const [model, usage] of Object.entries(this.usageReport)) {
      const cost = calculateDetailedCost({
        textInputTokens: usage.textInput,
        audioInputTokens: usage.audioInput,
        candidatesTokens: usage.output,
        thoughtsTokens: usage.thoughts,
        modelName: model,
      });
      totalCost += cost;

      reportLog += `Model: ${model}\n`;
      reportLog += `  - Text Input: ${usage.textInput.toLocaleString()}\n`;
      reportLog += `  - Audio Input: ${usage.audioInput.toLocaleString()}\n`;
      reportLog += `  - Output: ${usage.output.toLocaleString()}\n`;
      reportLog += `  - Thoughts: ${usage.thoughts.toLocaleString()}\n`;
      reportLog += `  - Cached: ${usage.cached.toLocaleString()}${usage.cached > 0 ? ' ✨' : ''}\n`;
      reportLog += `  - Total: ${usage.total.toLocaleString()}\n`;
      reportLog += `  - Est. Cost: $${cost.toFixed(6)}\n`;
      reportLog += `----------------------------------------\n`;
      grandTotal += usage.total;
    }
    reportLog += `Grand Total Tokens: ${grandTotal.toLocaleString()}\n`;
    reportLog += `Total Est. Cost: $${totalCost.toFixed(6)}\n`;
    logger.info(reportLog);
  }

  /**
   * Get current usage data (for external access if needed)
   */
  getUsageData(): Record<string, ModelUsage> {
    return { ...this.usageReport };
  }

  /**
   * Get a flat analytics-friendly summary of token usage.
   * Aggregates across all models into a single object suitable for Amplitude/Mixpanel.
   */
  getAnalyticsSummary(): TokenUsageAnalytics {
    let totalPrompt = 0;
    let totalOutput = 0;
    let totalTokens = 0;
    let totalTextInput = 0;
    let totalAudioInput = 0;
    let totalThoughts = 0;
    let totalCached = 0;
    let totalCost = 0;

    for (const [model, usage] of Object.entries(this.usageReport)) {
      totalPrompt += usage.prompt;
      totalOutput += usage.output;
      totalTokens += usage.total;
      totalTextInput += usage.textInput;
      totalAudioInput += usage.audioInput;
      totalThoughts += usage.thoughts;
      totalCached += usage.cached;
      totalCost += calculateDetailedCost({
        textInputTokens: usage.textInput,
        audioInputTokens: usage.audioInput,
        candidatesTokens: usage.output,
        thoughtsTokens: usage.thoughts,
        modelName: model,
      });
    }

    return {
      total_prompt_tokens: totalPrompt,
      total_output_tokens: totalOutput,
      total_tokens: totalTokens,
      total_text_input_tokens: totalTextInput,
      total_audio_input_tokens: totalAudioInput,
      total_thoughts_tokens: totalThoughts,
      total_cached_tokens: totalCached,
      estimated_cost_usd: Math.round(totalCost * 1e6) / 1e6, // 6 decimal places
      models_used: Object.keys(this.usageReport).length,
    };
  }
}

/**
 * Flat analytics payload for token usage — suitable for Amplitude/Mixpanel event properties.
 */
export interface TokenUsageAnalytics {
  total_prompt_tokens: number;
  total_output_tokens: number;
  total_tokens: number;
  total_text_input_tokens: number;
  total_audio_input_tokens: number;
  total_thoughts_tokens: number;
  total_cached_tokens: number;
  /** Estimated cost in USD, rounded to 6 decimal places */
  estimated_cost_usd: number;
  /** Number of distinct models used in this generation */
  models_used: number;
}
