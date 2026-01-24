import { type SubtitleItem } from '@/types/subtitle';
import { timeToSeconds } from '@/services/subtitle/time';
import { calculateDuration } from '@/services/subtitle/time';
import { countCJKCharacters } from '@/lib/text';

// Validation thresholds
export const MAX_DURATION_SECONDS = 10;
export const MAX_CHINESE_CHARACTERS = 25;
export const OVERLAP_THRESHOLD_SECONDS = 2;

export interface ValidationResult {
  hasDurationIssue: boolean;
  hasLengthIssue: boolean;
  hasOverlapIssue: boolean;
  hasConfidenceIssue: boolean;
  hasRegressionIssue: boolean;
  hasCorruptedRangeIssue: boolean;
  duration: number;
  charCount: number;
  overlapAmount: number; // How many seconds of overlap (negative means gap)
}

/**
 * Validate a subtitle item against rules
 */
export const validateSubtitle = (sub: SubtitleItem, prevEndTime?: string): ValidationResult => {
  const duration = calculateDuration(sub.startTime, sub.endTime);
  const charCount = countCJKCharacters(sub.translated);

  // Check overlap: current start time < previous end time
  let overlapAmount = 0;
  if (prevEndTime) {
    const prevEnd = timeToSeconds(prevEndTime);
    const currentStart = timeToSeconds(sub.startTime);
    overlapAmount = prevEnd - currentStart; // Positive means overlap
  }

  // Only flag as issue if overlap exceeds threshold
  const hasOverlapIssue = overlapAmount > OVERLAP_THRESHOLD_SECONDS;

  return {
    hasDurationIssue: duration > MAX_DURATION_SECONDS,
    hasLengthIssue: charCount > MAX_CHINESE_CHARACTERS,
    hasOverlapIssue,
    hasConfidenceIssue: !!sub.lowConfidence,
    hasRegressionIssue: !!sub.hasRegressionIssue,
    hasCorruptedRangeIssue: !!sub.hasCorruptedRangeIssue,
    duration,
    charCount,
    overlapAmount,
  };
};
