/**
 * Result Transformers - Post-processing functions for subtitle results
 *
 * Pure functions that transform results without API calls.
 * Used by batch operations to normalize and merge results.
 */

import { type SubtitleItem } from '@/types/subtitle';
import { formatTime, timeToSeconds } from '@/services/subtitle/time';

/**
 * Adjust timestamp offset for batch results.
 *
 * Gemini may return relative (0-based) or absolute timestamps.
 * This function detects the format and adds the audio offset if needed.
 *
 * @param items - Processed subtitle items from Gemini
 * @param audioOffset - The audio slice start offset in seconds
 * @param originalStartSec - The original start time of the batch in seconds
 * @returns Items with corrected timestamps
 */
export function adjustTimestampOffset(
  items: SubtitleItem[],
  audioOffset: number,
  originalStartSec: number
): SubtitleItem[] {
  if (items.length === 0 || audioOffset === 0) {
    return items;
  }

  const firstStart = timeToSeconds(items[0].startTime);
  const expectedRelativeStart = 0;
  const expectedAbsoluteStart = originalStartSec;

  const diffRelative = Math.abs(firstStart - expectedRelativeStart);
  const diffAbsolute = Math.abs(firstStart - expectedAbsoluteStart);

  // If the result is closer to 0 than to the absolute start, it's likely relative.
  if (diffRelative < diffAbsolute) {
    return items.map((item) => ({
      ...item,
      startTime: formatTime(timeToSeconds(item.startTime) + audioOffset),
      endTime: formatTime(timeToSeconds(item.endTime) + audioOffset),
    }));
  }

  return items;
}
