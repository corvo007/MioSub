import { GlossaryItem } from '@/types/glossary';

/**
 * Validate and clean glossary item
 */
export function validateGlossaryItem(item: GlossaryItem): GlossaryItem | null {
  const term = item.term?.trim();
  const translation = item.translation?.trim();

  if (!term || !translation) {
    return null;
  }

  return {
    term,
    translation,
    notes: item.notes?.trim() || undefined,
  };
}
