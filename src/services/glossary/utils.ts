import { type AppSettings } from '@/types/settings';
import { type Glossary, type GlossaryItem } from '@/types/glossary';

/**
 * Get terms from the active glossary
 * This is the canonical way to get glossary terms from settings
 */
export function getActiveGlossaryTerms(settings: AppSettings): GlossaryItem[] {
  // 1. Check runtime override first (e.g. from End-to-End mode or temp settings)
  if (settings.glossary && settings.glossary.length > 0) {
    return settings.glossary;
  }

  // 2. Fallback to active glossary ID lookup
  if (!settings.glossaries || !settings.activeGlossaryId) {
    return [];
  }

  const activeGlossary = settings.glossaries.find((g) => g.id === settings.activeGlossaryId);
  return activeGlossary?.terms || [];
}

/**
 * Get the active glossary object.
 * targetLanguage is populated at app startup via migrateAllGlossaries.
 */
export function getActiveGlossary(settings: AppSettings): Glossary | null {
  if (!settings.glossaries || !settings.activeGlossaryId) {
    return null;
  }

  return settings.glossaries.find((g) => g.id === settings.activeGlossaryId) ?? null;
}
