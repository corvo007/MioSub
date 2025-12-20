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

/**
 * Preserve speaker information from original items.
 *
 * If a processed item has no speaker but the original did, preserve it.
 *
 * @param processed - Processed subtitle items
 * @param originalSpeakers - Map of id -> speaker from original items
 * @returns Items with preserved speaker info
 */
export function preserveSpeakerInfo(
  processed: SubtitleItem[],
  originalSpeakers: Map<string, string | undefined>
): SubtitleItem[] {
  return processed.map((p) => {
    if (!p.speaker && originalSpeakers.has(p.id)) {
      return { ...p, speaker: originalSpeakers.get(p.id) };
    }
    return p;
  });
}
