import {
  type GlossaryItem,
  type GlossaryExtractionResult,
  type GlossaryExtractionMetadata,
} from '@/types/glossary';
import { type PipelineContext } from './types';
import { getActiveGlossaryTerms } from '@/services/glossary/utils';
import { getActionableErrorMessage } from '@/services/api/gemini/client';
import { ArtifactSaver } from '@/services/api/gemini/debug/artifactSaver';
import { logger } from '@/services/utils/logger';

export class GlossaryHandler {
  static async handle(
    context: PipelineContext,
    glossaryPromise: Promise<GlossaryExtractionResult[]> | null,
    glossaryChunks: { index: number; start: number; end: number }[] | undefined,
    onGlossaryReady?: (metadata: GlossaryExtractionMetadata) => Promise<GlossaryItem[]>
  ): Promise<{ glossary: GlossaryItem[]; raw?: GlossaryExtractionResult[] }> {
    const { settings, onProgress, isDebug } = context;

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
          message: '正在提取术语...',
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
            message: '等待用户确认...',
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
            message: '术语表已应用。',
          });
        } else {
          logger.info('No glossary extraction needed', { totalTerms, hasFailures });
          onProgress?.({ id: 'glossary', total: 1, status: 'completed', message: '未发现术语。' });
        }
      } catch (e: any) {
        if (e.message === '操作已取消' || e.name === 'AbortError') {
          logger.info('Glossary extraction cancelled');
          onProgress?.({ id: 'glossary', total: 1, status: 'completed', message: '已取消' });
        } else {
          logger.warn('Glossary extraction failed or timed out', e);
          const actionableMsg = getActionableErrorMessage(e);
          const errorMsg = actionableMsg || '术语提取失败';
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
