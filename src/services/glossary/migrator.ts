import { Glossary, GlossaryItem } from '@/types/glossary';
import { validateGlossaryItem } from './validator';

/**
 * Migrate legacy glossary items to new Glossary structure
 */
export function migrateFromLegacyGlossary(legacyItems: GlossaryItem[]): Glossary {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name: 'Default',
    terms: legacyItems.filter((item) => validateGlossaryItem(item) !== null),
    createdAt: now,
    updatedAt: now,
  };
}
