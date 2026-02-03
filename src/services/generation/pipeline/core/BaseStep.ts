/**
 * BaseStep - Abstract base class implementing Template Method pattern
 *
 * Handles cross-cutting concerns:
 * - Semaphore management
 * - Progress reporting
 * - Abort signal checking
 * - Mock stage/API logic
 * - Artifact saving
 * - Error handling with fallback
 */

import { type Semaphore } from '@/services/utils/concurrency';
import { type StepName, type StepContext, type StepResult, type PostCheckResult } from './types';
import { UserActionableError } from '@/services/utils/errors';
import { ExpectedError } from '@/utils/expectedError';
import { logger } from '@/services/utils/logger';
import * as Sentry from '@sentry/electron/renderer';
import i18n from '@/i18n';

/** Error thrown when a step is cancelled, carrying timing data */
export class StepCancelledError extends Error {
  readonly durationMs: number;
  readonly stepName: string;
  constructor(stepName: string, durationMs: number) {
    super(i18n.t('services:pipeline.errors.cancelled'));
    this.name = 'StepCancelledError';
    this.stepName = stepName;
    this.durationMs = durationMs;
  }
}

const STEP_ORDER: StepName[] = [
  'transcribe',
  'refinement',
  'alignment',
  'translation',
  'proofread',
];

export type StageKey =
  | 'transcribing'
  | 'waiting_glossary'
  | 'waiting_speakers'
  | 'refining'
  | 'aligning'
  | 'translating'
  | 'proofing';

export abstract class BaseStep<TInput, TOutput> {
  abstract name: StepName;
  abstract stageKey: StageKey;

  // ===== Core execution (subclass must implement) =====
  protected abstract execute(input: TInput, ctx: StepContext): Promise<TOutput>;

  // ===== Optional hooks (subclass can override) =====
  protected preCheck?(input: TInput, ctx: StepContext): boolean | Promise<boolean>;
  protected preProcess?(input: TInput, ctx: StepContext): TInput | Promise<TInput>;
  protected postProcess?(output: TOutput, ctx: StepContext): TOutput | Promise<TOutput>;
  protected postCheck?(
    output: TOutput,
    isFinalAttempt: boolean,
    ctx: StepContext
  ): PostCheckResult | Promise<PostCheckResult>;
  protected loadMockData?(ctx: StepContext): TOutput | Promise<TOutput>;
  protected saveArtifact?(result: TOutput, ctx: StepContext): void | Promise<void>;
  protected getFallback?(input: TInput, error: Error, ctx: StepContext): TOutput;
  protected getSemaphore?(ctx: StepContext): Semaphore | null;

  // ===== Template Method =====
  async run(input: TInput, ctx: StepContext): Promise<StepResult<TOutput>> {
    return this.runInternal(input, ctx, true);
  }

  /**
   * Run without acquiring semaphore (for when semaphore is managed externally)
   */
  async runWithoutSemaphore(input: TInput, ctx: StepContext): Promise<StepResult<TOutput>> {
    return this.runInternal(input, ctx, false);
  }

  private async runInternal(
    input: TInput,
    ctx: StepContext,
    useSemaphore: boolean
  ): Promise<StepResult<TOutput>> {
    const { pipelineContext } = ctx;
    const { signal, onProgress } = pipelineContext;
    const startTime = Date.now();

    // 1. Check abort signal (before any work)
    if (signal?.aborted) {
      throw new StepCancelledError(this.name, 0);
    }

    // 2. Check if should skip by mockStage
    if (this.shouldSkipByMockStage(ctx)) {
      logger.info(`[Chunk ${ctx.chunk.index}] Skipping ${this.name} (mockStage)`);
      return {
        output: ctx.mockInputSegments as unknown as TOutput,
        status: 'skipped',
        durationMs: Date.now() - startTime,
        skipped: true,
      };
    }

    // 3. Report progress: waiting
    onProgress?.({
      id: ctx.chunk.index,
      total: ctx.totalChunks,
      status: 'processing',
      stage: this.stageKey,
      message: i18n.t(`services:pipeline.status.waiting${this.capitalizedName}`),
    });

    // 4. Acquire semaphore if defined and useSemaphore is true
    const semaphore = useSemaphore ? (this.getSemaphore?.(ctx) ?? null) : null;
    if (semaphore) await semaphore.acquire();

    try {
      // 5. Check abort again after acquiring semaphore
      if (signal?.aborted) {
        throw new StepCancelledError(this.name, Date.now() - startTime);
      }

      // 6. Report progress: processing
      onProgress?.({
        id: ctx.chunk.index,
        total: ctx.totalChunks,
        status: 'processing',
        stage: this.stageKey,
        message: i18n.t(`services:pipeline.status.${this.stageKey}`),
      });

      if (this.preCheck) {
        const shouldProceed = await this.preCheck(input, ctx);
        if (!shouldProceed) {
          logger.info(`[Chunk ${ctx.chunk.index}] ${this.name} preCheck returned false, skipping`);
          return {
            output: input as unknown as TOutput,
            status: 'skipped',
            durationMs: Date.now() - startTime,
            skipped: true,
          };
        }
      }

      if (this.shouldUseMockApi(ctx) && this.loadMockData) {
        logger.info(`[Chunk ${ctx.chunk.index}] Mocking ${this.name} (mockApi enabled)`);
        const mockResult = await this.loadMockData(ctx);
        await this.saveArtifact?.(mockResult, ctx);
        return {
          output: mockResult,
          status: 'mocked',
          durationMs: Date.now() - startTime,
          mocked: true,
        };
      }

      // 9. PreProcess
      const processedInput = this.preProcess ? await this.preProcess(input, ctx) : input;

      // 10. Execute with optional retry (if postCheck defined)
      let result: TOutput;
      if (this.postCheck) {
        result = await this.executeWithRetry(processedInput, ctx);
      } else {
        result = await this.execute(processedInput, ctx);
      }

      // 11. PostProcess
      const finalResult = this.postProcess ? await this.postProcess(result, ctx) : result;

      // 12. Save artifact
      await this.saveArtifact?.(finalResult, ctx);

      return {
        output: finalResult,
        status: 'success',
        durationMs: Date.now() - startTime,
      };
    } catch (e: any) {
      const durationMs = Date.now() - startTime;

      // 13. Error handling with fallback
      // Check for cancellation first
      if (
        signal?.aborted ||
        e.name === 'StepCancelledError' ||
        e.message === i18n.t('services:pipeline.errors.cancelled')
      ) {
        logger.info(`[Chunk ${ctx.chunk.index}] ${this.name} cancelled after ${durationMs}ms`);
        // Re-throw with timing data if not already a StepCancelledError
        if (e.name !== 'StepCancelledError') {
          throw new StepCancelledError(this.name, durationMs);
        }
        throw e;
      }

      logger.error(`[Chunk ${ctx.chunk.index}] ${this.name} failed`, e);

      if (this.getFallback) {
        const fallback = this.getFallback(input, e as Error, ctx);
        await this.saveArtifact?.(fallback, ctx);

        // Report to Sentry if not a user-actionable error
        if (
          !(e instanceof UserActionableError) &&
          !(e instanceof ExpectedError) &&
          !(e as any).isExpected
        ) {
          // Collect step-specific context if available
          const stepContext = (ctx as any).alignmentContext || {};

          Sentry.captureException(e, {
            level: 'error',
            tags: {
              source: 'pipeline_step_fallback',
              step_name: this.name,
            },
            extra: {
              chunk_index: ctx.chunk.index,
              total_chunks: ctx.totalChunks,
              chunk_start: ctx.chunk.start,
              chunk_end: ctx.chunk.end,
              // Include step-specific context (e.g., alignment language, romanize flag)
              ...stepContext,
            },
          });
        }

        // Analytics: Track step fallback with context (keeping for error dashboards)
        if (typeof window !== 'undefined' && window.electronAPI?.analytics) {
          // Collect step-specific context for analytics
          const analyticsContext = (ctx as any).alignmentContext || {};

          void window.electronAPI.analytics.track(
            'step_fallback',
            {
              step_name: this.name,
              chunk_index: ctx.chunk.index,
              total_chunks: ctx.totalChunks,
              error_name: (e as Error).name,
              error_message: (e as Error).message?.substring(0, 500), // Truncate to avoid overly long error messages
              // Include step-specific context
              ...analyticsContext,
            },
            'interaction'
          );
        }

        return {
          output: fallback,
          status: 'failed',
          durationMs: Date.now() - startTime,
          error: e as Error,
        };
      }
      throw e;
    } finally {
      // 14. Release semaphore
      if (semaphore) semaphore.release();
    }
  }

  // ===== Helper Methods =====
  protected shouldSkipByMockStage(ctx: StepContext): boolean {
    const myIndex = this.getStepIndex();
    // mockStageIndex > myIndex means we should skip this step
    return ctx.mockStageIndex >= 0 && ctx.mockStageIndex > myIndex;
  }

  protected shouldUseMockApi(ctx: StepContext): boolean {
    const mockApi = ctx.pipelineContext.settings.debug?.mockApi;
    if (!mockApi) return false;
    // Map step name to mockApi key
    const keyMap: Record<StepName, keyof typeof mockApi> = {
      transcribe: 'transcribe',
      waitDeps: 'transcribe', // No mock for waitDeps
      refinement: 'refinement',
      alignment: 'alignment',
      translation: 'translation',
      proofread: 'refinement', // Proofread uses same mock as refinement
    };
    return mockApi[keyMap[this.name]] === true;
  }

  protected getStepIndex(): number {
    return STEP_ORDER.indexOf(this.name);
  }

  private get capitalizedName(): string {
    return this.name.charAt(0).toUpperCase() + this.name.slice(1);
  }

  private async executeWithRetry(
    input: TInput,
    ctx: StepContext,
    maxRetries = 1
  ): Promise<TOutput> {
    let lastResult: TOutput | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const isFinalAttempt = attempt === maxRetries;
      const result = await this.execute(input, ctx);
      lastResult = result;

      if (!this.postCheck) return result;

      const checkResult = await this.postCheck(result, isFinalAttempt, ctx);
      if (checkResult.isValid || !checkResult.retryable) {
        return result;
      }

      if (attempt < maxRetries) {
        logger.warn(
          `[Chunk ${ctx.chunk.index}] ${this.name} postCheck failed, retrying (${attempt + 1}/${maxRetries})`
        );
      }
    }

    return lastResult!;
  }
}
