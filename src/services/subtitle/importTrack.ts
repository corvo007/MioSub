import type { SubtitleItem } from '@/types/subtitle';

/**
 * Heuristics for resolving the original/translation track of an imported
 * subtitle file.
 *
 * Plain SRT/ASS files carry only ONE text track per cue — the format has no
 * concept of "original vs translation". The parser therefore routes a single
 * track into `original` (see the fallback branches in parser.ts: `parseSrt`
 * single-line case and `parseAss` "Treat as Original"). That default is correct
 * for the common case (importing an external transcript you want to translate),
 * but wrong when re-importing MioSub's own translation-only export, where the
 * single track is the translation. We surface this ambiguity to the user
 * instead of guessing — the user has the context the file can no longer carry.
 */

/**
 * A file is "single-language" when at least one cue has original text but NO
 * cue carries any translated text. Genuine bilingual files always populate
 * `translated`, so they return false and never trigger the import prompt.
 */
export const isSingleLanguageImport = (items: SubtitleItem[]): boolean => {
  const hasOriginal = items.some((s) => s.original.trim().length > 0);
  const hasTranslated = items.some((s) => s.translated.trim().length > 0);
  return hasOriginal && !hasTranslated;
};

/**
 * Move the parsed single-track text from `original` into `translated`.
 * Used when the user declares an imported single-language file is the
 * translation rather than the source.
 */
export const reassignOriginalAsTranslation = (items: SubtitleItem[]): SubtitleItem[] =>
  items.map((item) => ({ ...item, original: '', translated: item.original }));
