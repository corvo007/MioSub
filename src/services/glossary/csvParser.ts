import i18n from '@/i18n';
import { type Glossary, type GlossaryItem } from '@/types/glossary';
import { validateGlossaryItem } from '@/services/glossary/validator';
import { detectGlossaryLanguage } from '@/services/utils/language';

const HEADER_NAMES = new Set([
  'term',
  'source',
  'original',
  '原文',
  '术语',
  '用語',
  'translation',
  'target',
  '译文',
  '翻译',
  '翻訳',
  'notes',
  'note',
  'comment',
  '备注',
  'メモ',
]);

/**
 * Parse a single CSV line respecting quoted fields
 */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

/**
 * Detect if the first row is a header row
 */
function isHeaderRow(fields: string[]): boolean {
  return fields.some((f) => HEADER_NAMES.has(f.trim().toLowerCase()));
}

/**
 * Import glossary from CSV string
 */
export function importGlossaryFromCsv(csvContent: string, filename: string): Glossary {
  const lines = csvContent.split(/\r?\n/).filter((line) => line.trim() !== '');

  if (lines.length === 0) {
    throw new Error(i18n.t('services:glossary.errors.csvEmpty'));
  }

  let startIndex = 0;
  const firstFields = parseCsvLine(lines[0]);
  if (isHeaderRow(firstFields)) {
    startIndex = 1;
  }

  const items: GlossaryItem[] = [];
  for (let i = startIndex; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    if (fields.length < 2) continue;

    const raw: GlossaryItem = {
      term: fields[0],
      translation: fields[1],
      notes: fields[2] || undefined,
    };
    const validated = validateGlossaryItem(raw);
    if (validated) items.push(validated);
  }

  if (items.length === 0) {
    throw new Error(i18n.t('services:glossary.errors.csvNoValidTerms'));
  }

  const name = filename.replace(/\.csv$/i, '') || 'Imported CSV Glossary';
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    name,
    terms: items,
    targetLanguage: detectGlossaryLanguage({ terms: items } as Glossary),
    createdAt: now,
    updatedAt: now,
  };
}
