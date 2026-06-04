/**
 * Auto-confirm glossary terms and persist to settings
 * Shared logic between End-to-End mode and manual Workspace mode
 */

import i18n from '@/i18n';
import type { GlossaryItem, GlossaryExtractionMetadata } from '@/types/glossary';
import type { AppSettings } from '@/types/settings';
import { mergeGlossaryResults } from '@/services/glossary/merger';
import { createGlossary } from '@/services/glossary/manager';
import { logger } from '@/services/utils/logger';

export interface AutoConfirmOptions {
  /** Extraction metadata from AI */
  metadata: GlossaryExtractionMetadata;
  /** Current app settings */
  settings: AppSettings;
  /** Settings updater function */
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  /** Optional: Override target glossary ID (e.g., from wizard config) */
  targetGlossaryId?: string;
  /** Optional: Fallback terms if no new terms extracted */
  fallbackTerms?: GlossaryItem[];
  /** Optional: Log prefix for debugging */
  logPrefix?: string;
}

export interface AutoConfirmResult {
  /** Final terms to use for translation */
  terms: GlossaryItem[];
  /** Number of new terms added */
  newTermsCount: number;
  /** ID of the target glossary */
  glossaryId: string | null;
}

/**
 * Auto-confirm extracted glossary terms and persist to settings
 */
export function autoConfirmGlossaryTerms(options: AutoConfirmOptions): AutoConfirmResult {
  const {
    metadata,
    settings,
    updateSetting,
    targetGlossaryId: overrideTargetId,
    fallbackTerms = [],
    logPrefix = '[Glossary]',
  } = options;

  // 1. Merge and resolve conflicts
  const { unique, conflicts } = mergeGlossaryResults(metadata.results || []);
  const autoResolvedConflicts = conflicts.map((c) => {
    const newOption = c.options.find((opt) => !c.hasExisting || opt !== c.options[0]);
    return newOption || c.options[0];
  });
  const allTerms: GlossaryItem[] = [...unique, ...autoResolvedConflicts];

  // 2. Early return if no terms
  if (allTerms.length === 0) {
    logger.info(`${logPrefix} No new terms extracted`);
    return { terms: fallbackTerms, newTermsCount: 0, glossaryId: null };
  }

  // 3. Find or create target glossary
  const currentGlossaries = settings.glossaries || [];
  let targetGlossaryId = overrideTargetId || settings.activeGlossaryId;
  let updatedGlossaries = [...currentGlossaries];

  if (!targetGlossaryId || !currentGlossaries.find((g) => g.id === targetGlossaryId)) {
    const newGlossary = createGlossary(i18n.t('services:glossary.autoName'));
    newGlossary.terms = [];
    updatedGlossaries = [...currentGlossaries, newGlossary];
    targetGlossaryId = newGlossary.id;
    logger.info(`${logPrefix} Auto-created new glossary for extracted terms`);
  }

  // 4. Filter duplicates
  const activeG = updatedGlossaries.find((g) => g.id === targetGlossaryId);
  const activeTerms = activeG?.terms || [];
  const existingTerms = new Set(activeTerms.filter((g) => g.term).map((g) => g.term.toLowerCase()));
  const newTerms = allTerms.filter((t) => t.term && !existingTerms.has(t.term.toLowerCase()));

  // 5. Persist to settings
  if (newTerms.length > 0 || updatedGlossaries !== currentGlossaries) {
    const finalGlossaries = updatedGlossaries.map((g) => {
      if (g.id === targetGlossaryId) {
        const currentTerms = g.terms || [];
        return { ...g, terms: [...currentTerms, ...newTerms] };
      }
      return g;
    });

    updateSetting('glossaries', finalGlossaries);
    updateSetting('activeGlossaryId', targetGlossaryId);

    logger.info(
      `${logPrefix} Auto-added ${newTerms.length} terms to glossary "${activeG?.name || targetGlossaryId}"`
    );

    const updatedActive = finalGlossaries.find((g) => g.id === targetGlossaryId);
    return {
      terms: updatedActive?.terms || [],
      newTermsCount: newTerms.length,
      glossaryId: targetGlossaryId,
    };
  }

  return { terms: activeTerms, newTermsCount: 0, glossaryId: targetGlossaryId };
}
