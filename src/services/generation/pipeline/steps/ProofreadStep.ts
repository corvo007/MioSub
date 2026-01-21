/**
 * ProofreadStep - Handles batch subtitle proofreading
 *
 * Processes existing subtitles with optional audio context,
 * applying user comments, glossary, and AI-powered corrections.
 *
 * Unlike pipeline steps, ProofreadStep works on batches of existing subtitles
 * rather than generating new ones from audio.
 */

import { type Semaphore } from '@/services/utils/concurrency';
import { type PipelineContext, type SpeakerProfile } from '@/types/pipeline';
import { type SubtitleItem } from '@/types/subtitle';
import { type StepResult, type StepName } from '../core/types';
import { type StageKey } from '../core/BaseStep';
import { sliceAudioBuffer } from '@/services/audio/processor';
import { blobToBase64 } from '@/services/audio/converter';
import { timeToSeconds } from '@/services/subtitle/time';
import { toBatchPayloads } from '@/services/subtitle/payloads';
import { parseGeminiResponse } from '@/services/subtitle/parser';
import { reconcile } from '@/services/subtitle/reconciler';
import { adjustTimestampOffset } from '../resultTransformers';
import { getActiveGlossaryTerms } from '@/services/glossary/utils';
import { getProofreadPrompt } from '@/services/llm/prompts';
import { BATCH_SCHEMA, BATCH_WITH_DIARIZATION_SCHEMA } from '@/services/llm/schemas';
import { generateContentWithLongOutput } from '@/services/llm/providers/gemini';
import { STEP_MODELS, buildStepConfig } from '@/config';
import { logger } from '@/services/utils/logger';
import i18n from '@/i18n';

// ============================================================================
// Types
// ============================================================================

export interface ProofreadInput {
  /** The batch of subtitles to proofread */
  batch: SubtitleItem[];
  /** Optional batch-level comment from user */
  batchComment?: string;
  /** Speaker profiles for diarization */
  speakerProfiles?: SpeakerProfile[];
  /** System instruction (pre-generated) */
  systemInstruction: string;
}

export interface ProofreadContext {
  /** Pipeline context (AI client, settings, signal, etc.) */
  pipelineContext: PipelineContext;
  /** Semaphore for rate limiting */
  semaphore: Semaphore;
  /** Audio buffer for context (may be null for text-only) */
  audioBuffer: AudioBuffer | null;
  /** Total video duration for timestamp validation */
  totalVideoDuration?: number;
  /** Batch label for logging */
  batchLabel: string;
  /** Total number of batches */
  totalBatches: number;
  /** Current batch index (0-based) */
  batchIndex: number;
}

// ============================================================================
// ProofreadStep
// ============================================================================

export class ProofreadStep {
  readonly name: StepName = 'proofread';
  readonly stageKey: StageKey = 'proofing';

  /**
   * Run the proofread step for a single batch.
   *
   * This method handles:
   * - Abort signal checking
   * - Progress reporting
   * - Semaphore management
   * - Error handling with fallback
   */
  async run(input: ProofreadInput, ctx: ProofreadContext): Promise<StepResult<SubtitleItem[]>> {
    const { pipelineContext, semaphore, batchLabel, totalBatches, batchIndex } = ctx;
    const { signal, onProgress } = pipelineContext;

    // 1. Check abort signal
    if (signal?.aborted) {
      throw new Error(i18n.t('services:pipeline.errors.cancelled'));
    }

    // 2. Report progress: waiting
    onProgress?.({
      id: batchLabel,
      total: totalBatches,
      status: 'processing',
      stage: this.stageKey,
      message: i18n.t('services:pipeline.status.waitingProofread'),
    });

    // 3. Acquire semaphore
    await semaphore.acquire();

    try {
      // 4. Check abort again after acquiring semaphore
      if (signal?.aborted) {
        throw new Error(i18n.t('services:pipeline.errors.cancelled'));
      }

      // 5. Report progress: processing
      onProgress?.({
        id: batchLabel,
        total: totalBatches,
        status: 'processing',
        stage: this.stageKey,
        message: i18n.t('services:pipeline.status.proofing'),
      });

      // 6. Execute
      const result = await this.execute(input, ctx);

      // 7. Post-process: reconcile with original
      const finalResult = this.postProcess(result, input.batch);

      // 8. Report progress: completed
      onProgress?.({
        id: batchLabel,
        total: totalBatches,
        status: 'completed',
        stage: this.stageKey,
        message: i18n.t('services:pipeline.status.completed'),
      });

      return { output: finalResult };
    } catch (error) {
      logger.error(`[Batch ${batchLabel}] Proofread failed`, error);

      // Report error progress
      onProgress?.({
        id: batchLabel,
        total: totalBatches,
        status: 'error',
        stage: this.stageKey,
        message: i18n.t('services:pipeline.status.failed'),
      });

      // Return fallback (original batch)
      return { output: input.batch, error: error as Error };
    } finally {
      // 9. Release semaphore
      semaphore.release();
    }
  }

  /**
   * Core proofread execution logic.
   * Migrated from operations.ts processBatch().
   */
  private async execute(input: ProofreadInput, ctx: ProofreadContext): Promise<SubtitleItem[]> {
    const { batch, batchComment, systemInstruction } = input;
    const { pipelineContext, audioBuffer, totalVideoDuration, batchLabel } = ctx;
    const { ai, settings, signal, trackUsage } = pipelineContext;

    if (batch.length === 0) return [];

    const batchStartStr = batch[0].startTime;
    const batchEndStr = batch[batch.length - 1].endTime;
    const startSec = timeToSeconds(batchStartStr);
    const endSec = timeToSeconds(batchEndStr);

    // Prepare audio context
    let base64Audio = '';
    let audioOffset = 0;

    if (audioBuffer && startSec < endSec) {
      try {
        // Add padding (5 seconds before and after)
        audioOffset = Math.max(0, startSec - 5);
        const blob = await sliceAudioBuffer(
          audioBuffer,
          audioOffset,
          Math.min(audioBuffer.duration, endSec + 5)
        );
        base64Audio = await blobToBase64(blob);
      } catch (e) {
        logger.warn(`Audio slice failed for ${batchLabel}, falling back to text-only.`);
      }
    }

    // Convert to relative timestamps for AI
    const payload = toBatchPayloads(batch, audioOffset);

    // Build prompt with instructions
    const hasBatchComment = batchComment && batchComment.trim().length > 0;
    const hasLineComments = batch.some((s) => s.comment && s.comment.trim().length > 0);

    let specificInstruction = '';
    if (hasLineComments && !hasBatchComment) {
      specificInstruction = `
      USER LINE INSTRUCTIONS:
      1. Specific lines have "comment" fields. You MUST strictly follow these manual corrections.
      2. CRITICAL: For lines WITHOUT comments, DO NOT MODIFY THEM. Preserve them exactly as is. Only change lines with comments.
      `;
    } else if (hasLineComments && hasBatchComment) {
      specificInstruction = `
      USER INSTRUCTIONS:
      1. First, address the specific "comment" fields on individual lines.
      2. Second, apply this GLOBAL BATCH INSTRUCTION to the whole segment: "${batchComment}".
      3. You may modify any line to satisfy the global instruction or specific comments.
      `;
    } else if (hasBatchComment && !hasLineComments) {
      specificInstruction = `
      USER BATCH INSTRUCTION (Apply to ALL lines in this batch): "${batchComment}"
      `;
    }

    // Build glossary context
    const glossaryTerms = getActiveGlossaryTerms(settings);
    let glossaryContext = '';
    if (glossaryTerms.length > 0) {
      glossaryContext = `
      GLOSSARY (Strictly adhere to these terms):
      ${glossaryTerms.map((g) => `- ${g.term}: ${g.translation} ${g.notes ? `(${g.notes})` : ''}`).join('\n')}
      `;
      logger.info(`[Batch ${batchLabel}] Using glossary with ${glossaryTerms.length} terms.`);
    }

    // Generate prompt
    const prompt = getProofreadPrompt({
      totalVideoDuration,
      payload,
      glossaryContext,
      specificInstruction,
      targetLanguage: settings.targetLanguage,
    });

    // Call Gemini API
    const parts = [{ text: prompt }];
    if (base64Audio) {
      parts.push({
        inlineData: {
          mimeType: 'audio/wav',
          data: base64Audio,
        },
      } as { text: string } & { inlineData?: { mimeType: string; data: string } });
    }

    const model = STEP_MODELS.batchProofread;
    const stepConfig = buildStepConfig('batchProofread');

    const text = await generateContentWithLongOutput(
      ai,
      model,
      systemInstruction,
      parts,
      settings.enableDiarization ? BATCH_WITH_DIARIZATION_SCHEMA : BATCH_SCHEMA,
      stepConfig,
      signal,
      trackUsage,
      (settings.requestTimeout || 600) * 1000
    );

    let processedBatch = parseGeminiResponse(text, totalVideoDuration);

    if (processedBatch.length > 0) {
      // Log diarization info
      if (settings.enableDiarization) {
        logger.debug(
          `[Batch ${batchLabel}] Processed first item speaker: ${processedBatch[0].speaker}`
        );
      }
      // Adjust timestamp offset
      processedBatch = adjustTimestampOffset(processedBatch, audioOffset, startSec);
      return processedBatch;
    }

    // Fallback: return original batch
    return batch;
  }

  /**
   * Post-process: reconcile results with original batch to preserve metadata.
   */
  private postProcess(output: SubtitleItem[], originalBatch: SubtitleItem[]): SubtitleItem[] {
    if (output.length === 0) {
      return [...originalBatch];
    }
    return reconcile(originalBatch, output);
  }
}
