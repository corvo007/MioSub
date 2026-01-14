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
import { logger } from '@/services/utils/logger';
import i18n from '@/i18n';

const STEP_ORDER: StepName[] = ['transcribe', 'refinement', 'alignment', 'translation'];

export type StageKey =
  | 'transcribing'
  | 'waiting_glossary'
  | 'waiting_speakers'
  | 'refining'
  | 'aligning'
  | 'translating';

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

    // 1. Check abort signal
    if (signal?.aborted) {
      throw new Error(i18n.t('services:pipeline.errors.cancelled'));
    }

    // 2. Check if should skip by mockStage
    if (this.shouldSkipByMockStage(ctx)) {
      logger.info(`[Chunk ${ctx.chunk.index}] Skipping ${this.name} (mockStage)`);
      return { output: ctx.mockInputSegments as unknown as TOutput, skipped: true };
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
        throw new Error(i18n.t('services:pipeline.errors.cancelled'));
      }

      // 6. Report progress: processing
      onProgress?.({
        id: ctx.chunk.index,
        total: ctx.totalChunks,
        status: 'processing',
        stage: this.stageKey,
        message: i18n.t(`services:pipeline.status.${this.stageKey}`),
      });

      // 7. PreCheck - can skip execution
      if (this.preCheck) {
        const shouldProceed = await this.preCheck(input, ctx);
        if (!shouldProceed) {
          logger.info(`[Chunk ${ctx.chunk.index}] ${this.name} preCheck returned false, skipping`);
          return { output: input as unknown as TOutput, skipped: true };
        }
      }

      // 8. Check mockApi flag
      if (this.shouldUseMockApi(ctx) && this.loadMockData) {
        logger.info(`[Chunk ${ctx.chunk.index}] Mocking ${this.name} (mockApi enabled)`);
        const mockResult = await this.loadMockData(ctx);
        await this.saveArtifact?.(mockResult, ctx);
        return { output: mockResult, mocked: true };
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

      return { output: finalResult };
    } catch (e) {
      // 13. Error handling with fallback
      logger.error(`[Chunk ${ctx.chunk.index}] ${this.name} failed`, e);
      if (this.getFallback) {
        const fallback = this.getFallback(input, e as Error, ctx);
        await this.saveArtifact?.(fallback, ctx);
        return { output: fallback, error: e as Error };
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
