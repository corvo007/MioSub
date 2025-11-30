// Re-export glossary services

export { createGlossary, renameGlossary, exportGlossary, importGlossary } from '@/services/glossary/manager';
export { mergeGlossaryResults } from '@/services/glossary/merger';
export { selectChunksByDuration } from '@/services/glossary/selector';
export { migrateFromLegacyGlossary } from '@/services/glossary/migrator';
export { validateGlossaryItem } from '@/services/glossary/validator';
