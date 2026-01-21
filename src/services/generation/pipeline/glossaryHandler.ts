import {
  type GlossaryItem,
  type GlossaryExtractionResult,
  type GlossaryExtractionMetadata,
} from '@/types/glossary';
import { type PipelineContext } from '@/types/pipeline';
import { getActiveGlossaryTerms } from '@/services/glossary/utils';
import { getActionableErrorMessage } from '@/services/llm/providers/gemini';
import { ArtifactSaver } from '@/services/generation/debug/artifactSaver';
import { logger } from '@/services/utils/logger';
import i18n from '@/i18n';

export class GlossaryHandler {
  static async handle(
    context: PipelineContext,
    glossaryPromise: Promise<GlossaryExtractionResult[]> | null,
    glossaryChunks: { index: number; start: number; end: number }[] | undefined,
    onGlossaryReady?: (metadata: GlossaryExtractionMetadata) => Promise<GlossaryItem[]>
  ): Promise<{ glossary: GlossaryItem[]; raw?: GlossaryExtractionResult[] }> {
    const { settings, onProgress } = context;

    // Local variable to capture results for artifact saving
    let extractedGlossaryResults: GlossaryExtractionResult[] | undefined;

    const handlerTask = async () => {
      if (glossaryPromise === null) {
        return { glossary: getActiveGlossaryTerms(settings) };
      }

      let finalGlossary = getActiveGlossaryTerms(settings);

      try {
        logger.info('Waiting for glossary extraction...');
        onProgress?.({
          id: 'glossary',
          total: 1,
          status: 'processing',
          message: i18n.t('services:pipeline.status.generatingGlossary'),
        });

        extractedGlossaryResults = await glossaryPromise;

        // Calculate metadata for UI decision making
        const totalTerms = extractedGlossaryResults.reduce((sum, r) => sum + r.terms.length, 0);
        const hasFailures = extractedGlossaryResults.some(
          (r) => r.confidence === 'low' && r.terms.length === 0
        );

        if (onGlossaryReady && (totalTerms > 0 || hasFailures)) {
          logger.info('Glossary extracted, waiting for user confirmation...', {
            totalTerms,
            hasFailures,
            resultsCount: extractedGlossaryResults.length,
          });
          onProgress?.({
            id: 'glossary',
            total: 1,
            status: 'processing',
            message: i18n.t('services:pipeline.status.waitingUserConfirm'),
          });

          // BLOCKING CALL (User Interaction)
          const confirmationPromise = onGlossaryReady({
            results: extractedGlossaryResults,
            totalTerms,
            hasFailures,
            glossaryChunks: glossaryChunks!,
          });

          finalGlossary = await confirmationPromise;

          logger.info('Glossary confirmed/updated.', { count: finalGlossary.length });
          onProgress?.({
            id: 'glossary',
            total: 1,
            status: 'completed',
            message: i18n.t('services:pipeline.status.glossaryApplied'),
          });
        } else {
          logger.info('No glossary extraction needed', { totalTerms, hasFailures });
          onProgress?.({
            id: 'glossary',
            total: 1,
            status: 'completed',
            message: i18n.t('services:pipeline.status.noTermsFound'),
          });
        }
      } catch (e: any) {
        if (
          e.message === 'Operation cancelled' ||
          e.message === i18n.t('endToEnd:errors.cancelled') ||
          e.name === 'AbortError'
        ) {
          logger.info('Glossary extraction cancelled');
          onProgress?.({
            id: 'glossary',
            total: 1,
            status: 'completed',
            message: i18n.t('services:pipeline.status.cancelled'),
          });
        } else {
          logger.warn('Glossary extraction failed or timed out', e);
          const actionableMsg = getActionableErrorMessage(e);
          const errorMsg =
            actionableMsg || i18n.t('services:pipeline.status.glossaryExtractionFailed');
          onProgress?.({ id: 'glossary', total: 1, status: 'error', message: errorMsg });
        }
      }
      return { glossary: finalGlossary, raw: extractedGlossaryResults };
    };

    const result = await handlerTask();

    // Save artifacts (side-effect)
    await ArtifactSaver.saveGlossary(result.glossary, result.raw, settings);

    return result;
  }
}
