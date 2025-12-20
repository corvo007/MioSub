import { type TokenUsage } from '@/types/api';
import { calculateDetailedCost } from '@/services/api/gemini/pricing';
import { logger } from '@/services/utils/logger';

interface ModelUsage {
  prompt: number;
  output: number;
  total: number;
  textInput: number;
  audioInput: number;
  thoughts: number;
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
      };
    }
    this.usageReport[model].prompt += usage.promptTokens;
    this.usageReport[model].output += usage.candidatesTokens;
    this.usageReport[model].total += usage.totalTokens;
    this.usageReport[model].textInput += usage.textInputTokens || 0;
    this.usageReport[model].audioInput += usage.audioInputTokens || 0;
    this.usageReport[model].thoughts += usage.thoughtsTokens || 0;
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
}
