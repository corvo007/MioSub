/**
 * WaitForDepsStep - Waits for glossary and speaker profile extraction
 */

import { BaseStep } from '@/services/generation/pipeline/core/BaseStep';
import { type StepContext, type StepName } from '@/services/generation/pipeline/core/types';
import { type SubtitleItem } from '@/types/subtitle';
import { type SpeakerProfile } from '@/types/pipeline';
import { type GlossaryItem } from '@/types/glossary';
import { logger } from '@/services/utils/logger';
import i18n from '@/i18n';

export interface WaitForDepsInput {
  segments: SubtitleItem[];
}

export interface WaitForDepsOutput {
  segments: SubtitleItem[];
  glossary: GlossaryItem[];
  speakerProfiles?: SpeakerProfile[];
}

export class WaitForDepsStep extends BaseStep<WaitForDepsInput, WaitForDepsOutput> {
  name: StepName = 'waitDeps';
  stageKey = 'waiting_glossary' as const;

  // No semaphore needed for waiting
  protected getSemaphore() {
    return null;
  }

  // WaitForDeps should never be skipped by mockStage - it's a dependency step
  protected shouldSkipByMockStage(): boolean {
    return false;
  }

  protected async execute(input: WaitForDepsInput, ctx: StepContext): Promise<WaitForDepsOutput> {
    const { deps, pipelineContext } = ctx;
    const { signal, onProgress, settings: _settings } = pipelineContext;
    const { glossaryState, speakerProfilePromise } = deps;

    // Wait for glossary
    onProgress?.({
      id: ctx.chunk.index,
      total: ctx.totalChunks,
      status: 'processing',
      stage: 'waiting_glossary',
      message: i18n.t('services:pipeline.status.waitingGlossary'),
    });

    if (signal?.aborted) throw new Error(i18n.t('services:pipeline.errors.cancelled'));

    logger.debug(`[Chunk ${ctx.chunk.index}] Waiting for glossary confirmation...`);
    const glossary = await glossaryState.get();

    if (signal?.aborted) throw new Error(i18n.t('services:pipeline.errors.cancelled'));

    logger.debug(
      `[Chunk ${ctx.chunk.index}] Glossary ready (${glossary.length} terms), proceeding`
    );

    // Store glossary in context for downstream steps
    ctx.glossary = glossary;

    // Wait for speaker profiles if enabled
    let speakerProfiles: SpeakerProfile[] | undefined;
    if (speakerProfilePromise !== null) {
      onProgress?.({
        id: ctx.chunk.index,
        total: ctx.totalChunks,
        status: 'processing',
        stage: 'waiting_speakers',
        message: i18n.t('services:pipeline.status.waitingSpeakerAnalysis'),
      });

      try {
        if (signal) {
          speakerProfiles = await Promise.race([
            speakerProfilePromise,
            new Promise<never>((_, reject) => {
              if (signal.aborted) reject(new Error('Operation cancelled'));
              else signal.addEventListener('abort', () => reject(new Error('Operation cancelled')));
            }),
          ]);
        } else {
          speakerProfiles = await speakerProfilePromise;
        }
      } catch (e) {
        if (signal?.aborted) throw new Error(i18n.t('services:pipeline.errors.cancelled'));
        logger.warn('Failed to get speaker profiles, proceeding without them', e);
      }
    }

    // Store speaker profiles in context
    ctx.speakerProfiles = speakerProfiles;

    // Update status to indicate dependencies are ready, preventing stale "Waiting for speaker..." message
    // while waiting for the next step's semaphore (usually Refinement)
    onProgress?.({
      id: ctx.chunk.index,
      total: ctx.totalChunks,
      status: 'processing',
      stage: 'waiting_refinement',
      message: i18n.t('services:pipeline.status.waitingRefinement'),
    });

    return {
      segments: input.segments,
      glossary,
      speakerProfiles,
    };
  }
}
