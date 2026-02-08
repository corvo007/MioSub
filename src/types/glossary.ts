export interface GlossaryItem {
  term: string;
  translation: string;
  notes?: string;
}

// Multi-Glossary Support
export interface Glossary {
  id: string; // UUID
  name: string; // User-defined name
  terms: GlossaryItem[]; // Terms list
  targetLanguage?: string; // Locale code (e.g., 'zh-TW', 'ja', 'en')
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}

export interface GlossaryStorage {
  glossaries: Glossary[];
  activeGlossaryId: string | null;
}

export interface GlossaryExtractionResult {
  terms: GlossaryItem[];
  source: 'chunk' | 'full';
  chunkIndex?: number;
  confidence?: 'high' | 'medium' | 'low';
}

export interface GlossaryExtractionMetadata {
  results: GlossaryExtractionResult[];
  totalTerms: number;
  hasFailures: boolean;
  glossaryChunks?: { index: number; start: number; end: number }[];
}
