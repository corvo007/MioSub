/**
 * Batch Replace Service
 *
 * High-performance batch find & replace for subtitles.
 * Supports plain text and regex patterns with capture group replacement.
 */

import { type SubtitleItem } from '@/types/subtitle';

// ============================================
// Types
// ============================================

export interface BatchReplaceConfig {
  /** Search pattern (plain text or regex) */
  searchPattern: string;
  /** Replacement text (supports $1, $2 capture groups in regex mode) */
  replaceWith: string;
  /** Enable regex mode */
  isRegex: boolean;
  /** Case-sensitive matching */
  caseSensitive: boolean;
  /** Target field(s) to search/replace */
  targetField: 'original' | 'translated' | 'both';
  /** Whole word matching (only in non-regex mode) */
  wholeWord?: boolean;
}

export interface MatchResult {
  /** Subtitle ID */
  subtitleId: string;
  /** Which field matched */
  field: 'original' | 'translated';
  /** Line number (1-indexed for display) */
  lineNumber: number;
  /** Number of matches in this field */
  matchCount: number;
  /** Original text before replacement */
  originalText: string;
  /** Preview of text after replacement */
  previewText: string;
  /** Start time of the subtitle (string format like "00:01:23,456") */
  startTime: string;
  /** End time of the subtitle (string format like "00:01:25,789") */
  endTime: string;
}

export interface ReplacePreviewResult {
  /** All matches found */
  matches: MatchResult[];
  /** Summary statistics */
  summary: {
    /** Total number of matches across all subtitles */
    totalMatches: number;
    /** Number of subtitles affected */
    affectedSubtitles: number;
    /** Matches in original field */
    originalMatches: number;
    /** Matches in translated field */
    translatedMatches: number;
  };
  /** Error message if regex is invalid */
  error?: string;
  /** Warning message (e.g., search too short) */
  warning?: string;
  /** Whether results were truncated due to too many matches */
  truncated?: boolean;
}

// ============================================
// Core Functions
// ============================================

/**
 * Escape special regex characters in a string
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Create a RegExp from the config
 * Pre-compiles the pattern for reuse across all subtitles
 */
export function createSearchRegex(config: BatchReplaceConfig): RegExp {
  const { searchPattern, isRegex, caseSensitive, wholeWord } = config;

  if (isRegex) {
    // Regex mode: use pattern as-is
    const flags = caseSensitive ? 'g' : 'gi';
    return new RegExp(searchPattern, flags);
  }

  // Plain text mode: escape special characters
  let escaped = escapeRegExp(searchPattern);

  // Whole word matching: wrap with word boundaries
  if (wholeWord) {
    escaped = `\\b${escaped}\\b`;
  }

  const flags = caseSensitive ? 'g' : 'gi';
  return new RegExp(escaped, flags);
}

/**
 * Count matches in a string without modifying it
 */
function countMatches(text: string, regex: RegExp): number {
  const matches = text.match(regex);
  return matches ? matches.length : 0;
}

/**
 * Preview replacements without modifying the original data
 * Returns match details for UI display
 */
export function previewReplacements(
  subtitles: SubtitleItem[],
  config: BatchReplaceConfig
): ReplacePreviewResult {
  const { searchPattern, replaceWith, targetField } = config;

  // Early return for empty pattern
  if (!searchPattern) {
    return {
      matches: [],
      summary: {
        totalMatches: 0,
        affectedSubtitles: 0,
        originalMatches: 0,
        translatedMatches: 0,
      },
    };
  }

  // Try to compile regex
  let regex: RegExp;
  try {
    regex = createSearchRegex(config);
  } catch (e) {
    return {
      matches: [],
      summary: {
        totalMatches: 0,
        affectedSubtitles: 0,
        originalMatches: 0,
        translatedMatches: 0,
      },
      error: e instanceof Error ? e.message : 'Invalid regex pattern',
    };
  }

  const matches: MatchResult[] = [];
  let totalMatches = 0;
  let originalMatches = 0;
  let translatedMatches = 0;
  const affectedIds = new Set<string>();

  // Single pass through all subtitles
  subtitles.forEach((sub, index) => {
    const lineNumber = index + 1;

    // Check original field
    if (targetField === 'original' || targetField === 'both') {
      const text = sub.original || '';
      const matchCount = countMatches(text, regex);
      regex.lastIndex = 0; // Reset for next use

      if (matchCount > 0) {
        const previewText = text.replace(regex, replaceWith);
        regex.lastIndex = 0;

        matches.push({
          subtitleId: sub.id,
          field: 'original',
          lineNumber,
          matchCount,
          originalText: text,
          previewText,
          startTime: sub.startTime,
          endTime: sub.endTime,
        });

        totalMatches += matchCount;
        originalMatches += matchCount;
        affectedIds.add(sub.id);
      }
    }

    // Check translated field
    if (targetField === 'translated' || targetField === 'both') {
      const text = sub.translated || '';
      const matchCount = countMatches(text, regex);
      regex.lastIndex = 0;

      if (matchCount > 0) {
        const previewText = text.replace(regex, replaceWith);
        regex.lastIndex = 0;

        matches.push({
          subtitleId: sub.id,
          field: 'translated',
          lineNumber,
          matchCount,
          originalText: text,
          previewText,
          startTime: sub.startTime,
          endTime: sub.endTime,
        });

        totalMatches += matchCount;
        translatedMatches += matchCount;
        affectedIds.add(sub.id);
      }
    }
  });

  return {
    matches,
    summary: {
      totalMatches,
      affectedSubtitles: affectedIds.size,
      originalMatches,
      translatedMatches,
    },
  };
}

/**
 * Execute batch replacement on subtitles
 * Returns a new array with replacements applied (immutable)
 *
 * Performance: O(n) single pass, regex compiled once
 */
export function executeBatchReplace(
  subtitles: SubtitleItem[],
  config: BatchReplaceConfig
): SubtitleItem[] {
  const { searchPattern, replaceWith, targetField } = config;

  // Early return for empty pattern
  if (!searchPattern) {
    return subtitles;
  }

  // Compile regex once
  const regex = createSearchRegex(config);

  // Single pass through all subtitles
  return subtitles.map((sub) => {
    let modified = false;
    let newOriginal = sub.original;
    let newTranslated = sub.translated;

    // Replace in original field
    if (targetField === 'original' || targetField === 'both') {
      const result = (sub.original || '').replace(regex, replaceWith);
      regex.lastIndex = 0; // Reset regex state for global flag

      if (result !== sub.original) {
        newOriginal = result;
        modified = true;
      }
    }

    // Replace in translated field
    if (targetField === 'translated' || targetField === 'both') {
      const result = (sub.translated || '').replace(regex, replaceWith);
      regex.lastIndex = 0;

      if (result !== sub.translated) {
        newTranslated = result;
        modified = true;
      }
    }

    // Only create new object if modified (memory optimization)
    return modified ? { ...sub, original: newOriginal, translated: newTranslated } : sub;
  });
}

/**
 * Execute replacement on a single subtitle
 * Returns the modified subtitle or the original if no changes
 */
export function executeSingleReplace(
  subtitle: SubtitleItem,
  field: 'original' | 'translated',
  config: BatchReplaceConfig
): SubtitleItem {
  const { searchPattern, replaceWith } = config;

  if (!searchPattern) {
    return subtitle;
  }

  const regex = createSearchRegex(config);
  const text = field === 'original' ? subtitle.original : subtitle.translated;
  const result = (text || '').replace(regex, replaceWith);

  if (result === text) {
    return subtitle;
  }

  return field === 'original'
    ? { ...subtitle, original: result }
    : { ...subtitle, translated: result };
}
