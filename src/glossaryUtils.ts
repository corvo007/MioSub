import { GlossaryItem, GlossaryExtractionResult, Glossary } from './types';

/**
 * Create a new empty glossary
 */
export function createGlossary(name: string): Glossary {
    const now = new Date().toISOString();
    return {
        id: crypto.randomUUID(),
        name: name.trim() || 'Untitled Glossary',
        terms: [],
        createdAt: now,
        updatedAt: now
    };
}

/**
 * Rename a glossary
 */
export function renameGlossary(glossary: Glossary, newName: string): Glossary {
    return {
        ...glossary,
        name: newName.trim() || glossary.name,
        updatedAt: new Date().toISOString()
    };
}

/**
 * Select audio chunks based on time duration limit
 * @param chunks - Array of chunk parameters
 * @param sampleMinutes - Time limit in minutes, or 'all' for entire file
 * @param chunkDuration - Duration of each chunk in seconds
 * @returns Selected chunks to analyze
 */
export function selectChunksByDuration(
    chunks: { index: number; start: number; end: number }[],
    sampleMinutes: number | 'all',
    chunkDuration: number
): { index: number; start: number; end: number }[] {
    if (sampleMinutes === 'all') {
        return chunks;
    }

    const targetSeconds = sampleMinutes * 60;
    const chunksNeeded = Math.ceil(targetSeconds / chunkDuration);

    // If calculated chunks exceed total, return all
    if (chunksNeeded >= chunks.length) {
        return chunks;
    }

    // Return chunks from the beginning
    return chunks.slice(0, chunksNeeded);
}

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
            const translations = new Set(allOptions.map(i => i.translation));
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
                    hasExisting: !!existingItem
                });
            }
        }
    }

    return { unique, duplicates, conflicts };
}

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
        notes: item.notes?.trim() || undefined
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
            throw new Error('Invalid glossary format');
        }

        // Validate items
        const validItems = parsed.terms
            .map((item: any) => validateGlossaryItem(item))
            .filter((item: any): item is GlossaryItem => item !== null);

        return {
            id: crypto.randomUUID(), // Always generate new ID on import to avoid conflicts
            name: parsed.name,
            terms: validItems,
            createdAt: parsed.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
    } catch (e) {
        throw new Error('Failed to parse glossary file');
    }
}

/**
 * Migrate legacy glossary items to new Glossary structure
 */
export function migrateFromLegacyGlossary(legacyItems: GlossaryItem[]): Glossary {
    const now = new Date().toISOString();
    return {
        id: crypto.randomUUID(),
        name: 'Default',
        terms: legacyItems.filter(item => validateGlossaryItem(item) !== null),
        createdAt: now,
        updatedAt: now
    };
}
