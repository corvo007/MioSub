import { type Glossary } from '@/types/glossary';
import { detectGlossaryLanguage } from '@/services/utils/language';

/**
 * Migrate a glossary to include targetLanguage if missing.
 *
 * - If targetLanguage is already set, returns as-is.
 * - If glossary has terms, detects language from translations via ELD.
 * - If glossary is empty, uses the provided fallback language.
 */
export function migrateGlossaryLanguage(glossary: Glossary, fallbackLanguage?: string): Glossary {
  if (glossary.targetLanguage) return glossary;

  const detectedLanguage =
    glossary.terms.length > 0 ? detectGlossaryLanguage(glossary) : fallbackLanguage || 'en';

  return { ...glossary, targetLanguage: detectedLanguage };
}

/**
 * Migrate all glossaries in-place. Returns the array and whether any were changed.
 */
export function migrateAllGlossaries(
  glossaries: Glossary[],
  fallbackLanguage?: string
): { glossaries: Glossary[]; changed: boolean } {
  let changed = false;
  const result = glossaries.map((g) => {
    if (g.targetLanguage) return g;
    changed = true;
    return migrateGlossaryLanguage(g, fallbackLanguage);
  });
  return { glossaries: result, changed };
}
