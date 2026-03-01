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

/** Known pipeline step names for per-step token tracking */
export type PipelineStep = 'glossary' | 'speaker' | 'refinement' | 'translation';

const EMPTY_USAGE = (): ModelUsage => ({
  prompt: 0,
  output: 0,
  total: 0,
  textInput: 0,
  audioInput: 0,
  thoughts: 0,
  cached: 0,
});

/**
 * Centralized token usage tracking and reporting.
 *
 * Tracks usage along two independent dimensions:
 * - **Per model** (e.g. gemini-2.0-flash, gemini-2.5-pro) — for cost calculation
 * - **Per pipeline step** (glossary, speaker, refinement, translation) — for optimization analysis
 */
export class UsageReporter {
  private usageByModel: Record<string, ModelUsage> = {};
  private usageByStep: Record<PipelineStep, ModelUsage> = {
    glossary: EMPTY_USAGE(),
    speaker: EMPTY_USAGE(),
    refinement: EMPTY_USAGE(),
    translation: EMPTY_USAGE(),
  };

  /**
   * Track usage from a single API call.
   * @param usage Token usage data from the API response
   * @param step Optional pipeline step tag for per-step breakdown
   */
  track(usage: TokenUsage, step?: PipelineStep): void {
    const model = usage.modelName;

    // --- Per-model accumulation (existing behavior) ---
    if (!this.usageByModel[model]) {
      this.usageByModel[model] = EMPTY_USAGE();
    }
    this._addUsage(this.usageByModel[model], usage);

    // --- Per-step accumulation (new) ---
    if (step) {
      this._addUsage(this.usageByStep[step], usage);
    }
  }

  private _addUsage(target: ModelUsage, usage: TokenUsage): void {
    target.prompt += usage.promptTokens;
    target.output += usage.candidatesTokens;
    target.total += usage.totalTokens;
    target.textInput += usage.textInputTokens || 0;
    target.audioInput += usage.audioInputTokens || 0;
    target.thoughts += usage.thoughtsTokens || 0;
    target.cached += usage.cachedTokens || 0;
  }

  /**
   * Get the track function bound to this instance (for passing to API calls).
   * When called without a step, returns an untagged tracker (backward-compatible).
   * When called with a step, returns a tracker that tags all usage with that step.
   */
  getTracker(step?: PipelineStep): (usage: TokenUsage) => void {
    return (usage: TokenUsage) => this.track(usage, step);
  }

  /**
   * Log the final usage report with cost calculation
   */
  logReport(): void {
    let reportLog = '\n📊 Token Usage Report:\n----------------------------------------\n';
    let grandTotal = 0;
    let totalCost = 0;

    for (const [model, usage] of Object.entries(this.usageByModel)) {
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

    // Per-step breakdown
    reportLog += `\n📋 Per-Step Breakdown:\n`;
    for (const [step, usage] of Object.entries(this.usageByStep)) {
      if (usage.total === 0) continue;
      const pct = grandTotal > 0 ? ((usage.total / grandTotal) * 100).toFixed(1) : '0';
      reportLog += `  ${step}: ${usage.total.toLocaleString()} tokens (${pct}%) — in: ${usage.prompt.toLocaleString()}, out: ${usage.output.toLocaleString()}\n`;
    }

    reportLog += `----------------------------------------\n`;
    reportLog += `Grand Total Tokens: ${grandTotal.toLocaleString()}\n`;
    reportLog += `Total Est. Cost: $${totalCost.toFixed(6)}\n`;
    logger.info(reportLog);
  }

  /**
   * Get current usage data (for external access if needed)
   */
  getUsageData(): Record<string, ModelUsage> {
    return { ...this.usageByModel };
  }

  /**
   * Get a flat analytics-friendly summary of token usage.
   * Aggregates across all models into a single object suitable for Amplitude/Mixpanel.
   *
   * Includes three levels of breakdown:
   * 1. Grand totals (existing) — total_prompt_tokens, total_output_tokens, etc.
   * 2. Per-step totals (new) — tokens_glossary_input, tokens_translation_output, etc.
   * 3. Per-model totals (new) — model_tokens_<normalized_name>_input/output
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

    // Per-model analytics (改动 2)
    const modelBreakdown: Record<string, { input: number; output: number }> = {};

    for (const [model, usage] of Object.entries(this.usageByModel)) {
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
      modelBreakdown[model] = { input: usage.prompt, output: usage.output };
    }

    // Per-step analytics (改动 1)
    const stepFields: Record<string, number> = {};
    for (const [step, usage] of Object.entries(this.usageByStep)) {
      if (usage.total === 0) continue;
      stepFields[`tokens_${step}_input`] = usage.prompt;
      stepFields[`tokens_${step}_output`] = usage.output;
    }

    // Per-model analytics: structured array (one entry per model, easy to group-by)
    const modelBreakdownArray = Object.entries(modelBreakdown).map(([model, usage]) => ({
      model,
      input: usage.input,
      output: usage.output,
    }));

    return {
      // Grand totals (existing — backward compatible)
      total_prompt_tokens: totalPrompt,
      total_output_tokens: totalOutput,
      total_tokens: totalTokens,
      total_text_input_tokens: totalTextInput,
      total_audio_input_tokens: totalAudioInput,
      total_thoughts_tokens: totalThoughts,
      total_cached_tokens: totalCached,
      estimated_cost_usd: Math.round(totalCost * 1e6) / 1e6, // 6 decimal places
      models_used: Object.keys(this.usageByModel).length,
      // Per-step breakdown (改动 1) — fixed keys, easy to query
      ...stepFields,
      // Per-model breakdown (改动 2) — single structured field, easy to group-by model name
      model_token_breakdown: modelBreakdownArray,
    };
  }
}

/**
 * Flat analytics payload for token usage — suitable for Amplitude/Mixpanel event properties.
 *
 * Fixed fields are typed explicitly; per-step fields use index signature
 * because the exact keys depend on which steps ran.
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
  /** Per-model token breakdown as a structured array (easy to group-by model name) */
  model_token_breakdown: { model: string; input: number; output: number }[];

  /**
   * Dynamic per-step fields: tokens_glossary_input, tokens_glossary_output,
   * tokens_refinement_input, tokens_translation_output, etc.
   */
  [key: string]: number | { model: string; input: number; output: number }[];
}
