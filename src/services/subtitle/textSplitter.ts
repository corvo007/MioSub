import { type SubtitleItem } from '@/types/subtitle';
import { logger } from '@/services/utils/logger';
import { formatTime, timeToSeconds } from '@/services/subtitle/time';

export interface SplitConfig {
  maxLength: number;
  minLength?: number;
  locale?: string;
}

export interface SplitResult {
  text: string;
  ratio: number;
}

/**
 * Calculate visual width of text.
 * CJK characters (full-width) count as 2 units, others count as 1.
 */
export function getVisualWidth(text: string): number {
  let width = 0;
  for (const char of text) {
    const code = char.codePointAt(0) || 0;
    // CJK ranges: Chinese, Japanese, Korean, full-width punctuation
    if (
      (code >= 0x4e00 && code <= 0x9fff) || // CJK Unified Ideographs
      (code >= 0x3400 && code <= 0x4dbf) || // CJK Unified Ideographs Extension A
      (code >= 0x3000 && code <= 0x303f) || // CJK Symbols and Punctuation
      (code >= 0x3040 && code <= 0x309f) || // Hiragana
      (code >= 0x30a0 && code <= 0x30ff) || // Katakana
      (code >= 0xac00 && code <= 0xd7af) || // Korean Hangul Syllables
      (code >= 0xff00 && code <= 0xffef) // Full-width ASCII & Punctuation
    ) {
      width += 2;
    } else {
      width += 1;
    }
  }
  return width;
}

/**
 * Split text at word boundaries using Intl.Segmenter
 * @param text Original text to split
 * @param locale Locale for segmentation
 * @param maxWidth Maximum visual width for each segment
 * @returns Array of split results with text and length ratio
 */
export function splitAtWordBoundary(text: string, locale: string, maxWidth: number): SplitResult[] {
  if (getVisualWidth(text) <= maxWidth) {
    return [{ text, ratio: 1 }];
  }

  try {
    const segmenter = new Intl.Segmenter(locale, { granularity: 'word' });
    const segments = [...segmenter.segment(text)];

    // Find the best split point closest to the middle
    // We want to balance the two halves as much as possible, but respecting max length
    // Ideally, we split into chunks that occur naturally at word boundaries

    // Simple recursive strategy:
    // 1. Find a split point near the middle
    // 2. Split into left and right
    // 3. Recursively process left and right

    // We define a search range around the ideal midpoint
    // Ideally we want to split at roughly maxLength from the start if the text is very long,
    // or just in the middle if it's just slightly over.
    // Let's try to split as close to the Halfway point as possible first.

    const midpoint = Math.floor(text.length / 2);
    let bestSplitIndex = -1;
    let minDistanceToMid = Infinity;

    for (const { index } of segments) {
      // Only split at word boundaries (which are essentially where words start)
      // We can split BEFORE a word.
      // Intl.Segmenter segments include punctuation attached to words or as separate segments.
      // We generally want to split at a point where a new word starts.

      // Iterate through segments to find the word boundary closest to the midpoint
      if (index > 0 && index < text.length) {
        const distance = Math.abs(index - midpoint);
        if (distance < minDistanceToMid) {
          minDistanceToMid = distance;
          bestSplitIndex = index;
        }
      }
    }

    // Fallback if no valid split point found
    if (bestSplitIndex === -1) {
      bestSplitIndex = midpoint;
    }

    const part1 = text.slice(0, bestSplitIndex).trim();
    const part2 = text.slice(bestSplitIndex).trim();

    // Safety check for empty parts
    if (part1.length === 0 || part2.length === 0) {
      // Should not happen with valid midpoint, but safe guard
      return [{ text, ratio: 1 }];
    }

    // Calculate total length for ratio (excluding trimmed spaces is tricky,
    // but for ratio we can just use the length of the parts relative to their sum)
    const len1 = part1.length;
    const len2 = part2.length;
    const totalLen = len1 + len2;

    const result1 = splitAtWordBoundary(part1, locale, maxWidth);
    const result2 = splitAtWordBoundary(part2, locale, maxWidth);

    // Combine results and adjust ratios
    return [
      ...result1.map((r) => ({ ...r, ratio: r.ratio * (len1 / totalLen) })),
      ...result2.map((r) => ({ ...r, ratio: r.ratio * (len2 / totalLen) })),
    ];
  } catch (error) {
    logger.warn('Failed to split text with Intl.Segmenter, falling back to simple split', error);
    // Fallback to simple slice if Intl not supported or fails
    const midpoint = Math.floor(text.length / 2);
    return [
      { text: text.slice(0, midpoint), ratio: 0.5 },
      { text: text.slice(midpoint), ratio: 0.5 },
    ];
  }
}

/**
 * Distribute timeline proportional to text length
 */
export function distributeTimeline(
  parts: SplitResult[],
  startTime: string,
  endTime: string
): SubtitleItem[] {
  const startMs = Math.round(timeToSeconds(startTime) * 1000);
  const endMs = Math.round(timeToSeconds(endTime) * 1000);
  const totalDuration = endMs - startMs;

  let currentMs = startMs;
  const results: any[] = [];

  parts.forEach((part, index) => {
    const duration = Math.floor(totalDuration * part.ratio);
    const segEndMs = index === parts.length - 1 ? endMs : currentMs + duration;

    results.push({
      original: part.text,
      startMs: currentMs,
      endMs: segEndMs,
      startTime: formatTime(currentMs / 1000),
      endTime: formatTime(segEndMs / 1000),
    });

    currentMs = segEndMs;
  });

  return results;
}

/**
 * Split a subtitle segment if it exceeds max visual width
 */
export function splitLongSegment(
  segment: SubtitleItem,
  config: SplitConfig,
  defaultLocale: string
): SubtitleItem[] {
  // Use visual width: CJK chars count as 2, others as 1
  if (getVisualWidth(segment.original) <= config.maxLength) {
    return [segment];
  }

  const locale = config.locale || defaultLocale;
  const parts = splitAtWordBoundary(segment.original, locale, config.maxLength);

  // Calculate distribution
  const distributed = distributeTimeline(parts, segment.startTime, segment.endTime);

  return distributed.map((d, i) => ({
    ...segment,
    id: `${segment.id}-${i + 1}`,
    original: d.original,
    startTime: d.startTime,
    endTime: d.endTime,
    // Clear translation since original text is split and we can't split the translation 1:1 automatically.
    // Refinement runs before translation, so this field is usually empty anyway.
    translated: '',
  }));
}
