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
 * RFC 4180-compliant CSV parser that handles quoted fields with embedded newlines.
 */
function parseCSVLines(content: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          currentField += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentField.trim());
        currentField = '';
      } else if (char === '\r' && nextChar === '\n') {
        currentRow.push(currentField.trim());
        if (currentRow.some(f => f.length > 0)) rows.push(currentRow);
        currentRow = [];
        currentField = '';
        i++;
      } else if (char === '\n') {
        currentRow.push(currentField.trim());
        if (currentRow.some(f => f.length > 0)) rows.push(currentRow);
        currentRow = [];
        currentField = '';
      } else {
        currentField += char;
      }
    }
  }

  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some(f => f.length > 0)) rows.push(currentRow);
  }

  return rows;
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
  csvContent = csvContent.replace(/^\uFEFF/, '');
  const rows = parseCSVLines(csvContent);

  if (rows.length === 0) {
    throw new Error(i18n.t('services:glossary.errors.csvEmpty'));
  }

  let startIndex = 0;
  if (isHeaderRow(rows[0])) {
    startIndex = 1;
  }

  const items: GlossaryItem[] = [];
  for (let i = startIndex; i < rows.length; i++) {
    const fields = rows[i];
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
