import { type GlossaryItem, type GlossaryExtractionResult } from '@/types/glossary';

/**
 * Merge and deduplicate glossary results from multiple extractions
 * @param results - Array of extraction results
 * @returns Object with unique terms and duplicates map
 */
export function mergeGlossaryResults(
  results: GlossaryExtractionResult[],
  existingGlossary: GlossaryItem[] = []
): {
  unique: GlossaryItem[];
  duplicates: Map<string, GlossaryItem[]>;
  conflicts: Array<{ term: string; options: GlossaryItem[]; hasExisting: boolean }>;
} {
  const termMap = new Map<string, GlossaryItem[]>();

  // Collect all terms
  for (const result of results) {
    for (const item of result.terms) {
      const key = item.term.toLowerCase().trim();
      if (!termMap.has(key)) {
        termMap.set(key, []);
      }
      termMap.get(key)!.push(item);
    }
  }

  // Add existing glossary terms to the map for conflict checking
  const existingMap = new Map<string, GlossaryItem>();
  for (const item of existingGlossary) {
    existingMap.set(item.term.toLowerCase().trim(), item);
  }

  const unique: GlossaryItem[] = [];
  const duplicates = new Map<string, GlossaryItem[]>();
  const conflicts: Array<{ term: string; options: GlossaryItem[]; hasExisting: boolean }> = [];

  // Process each term
  for (const [key, items] of Array.from(termMap.entries())) {
    const existingItem = existingMap.get(key);

    // If we have an existing item, add it to the options to check for conflicts
    const allOptions = existingItem ? [existingItem, ...items] : items;

    if (allOptions.length === 1) {
      // Unique term (only one extraction and no existing)
      unique.push(allOptions[0]);
    } else {
      // Check if translations are identical
      const translations = new Set(allOptions.map((i) => i.translation));
      if (translations.size === 1) {
        // Same translation, just take the first one (prefer existing if available)
        unique.push(existingItem || items[0]);
        duplicates.set(key, items);
      } else {
        // Different translations - conflict!
        // If existing item is present, mark it
        conflicts.push({
          term: existingItem ? existingItem.term : items[0].term,
          options: allOptions,
          hasExisting: !!existingItem,
        });
      }
    }
  }

  return { unique, duplicates, conflicts };
}
