import i18n from '@/i18n';
import { type Glossary, type GlossaryItem } from '@/types/glossary';
import { validateGlossaryItem } from '@/services/glossary/validator';

/**
 * Create a new empty glossary
 */
export function createGlossary(name: string, targetLanguage?: string): Glossary {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name: name.trim() || 'Untitled Glossary',
    terms: [],
    targetLanguage,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Rename a glossary
 */
export function renameGlossary(glossary: Glossary, newName: string): Glossary {
  return {
    ...glossary,
    name: newName.trim() || glossary.name,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Export glossary to JSON string
 */
export function exportGlossary(glossary: Glossary): string {
  return JSON.stringify(glossary, null, 2);
}

/**
 * Import glossary from JSON string
 */
export function importGlossary(jsonContent: string): Glossary {
  try {
    const parsed = JSON.parse(jsonContent);

    // Basic validation
    if (!parsed.name || !Array.isArray(parsed.terms)) {
      throw new Error(i18n.t('services:glossary.errors.invalidFormat'));
    }

    // Validate items
    const validItems = parsed.terms
      .map((item: any) => validateGlossaryItem(item))
      .filter((item: any): item is GlossaryItem => item !== null);

    return {
      id: crypto.randomUUID(), // Always generate new ID on import to avoid conflicts
      name: parsed.name,
      terms: validItems,
      targetLanguage: parsed.targetLanguage,
      createdAt: parsed.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  } catch (e) {
    if (e instanceof Error && e.message !== i18n.t('services:glossary.errors.invalidFormat')) {
      throw new Error(i18n.t('services:glossary.errors.parseFailed'));
    }
    throw e;
  }
}
