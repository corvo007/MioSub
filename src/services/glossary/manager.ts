import { Glossary, GlossaryItem } from '@/types/glossary';
import { validateGlossaryItem } from './validator';

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
