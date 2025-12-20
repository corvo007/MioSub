/**
 * Timeline Validation Module
 *
 * Detects timeline anomalies in subtitle refinement output:
 * 1. Excessive duration (>10s) - used for pattern detection
 * 2. Time regression - startTime goes backwards significantly
 * 3. Corrupted range - combination of excessive duration followed by regression
 */

import type { SubtitleItem } from '@/types/subtitle';
import { timeToSeconds } from '@/services/subtitle/time';

// Thresholds
const EXCESSIVE_DURATION_THRESHOLD = 10; // seconds
const REGRESSION_THRESHOLD = 5; // seconds (startTime < prev startTime - threshold)

/**
 * Individual timeline anomaly
 */
export interface TimelineAnomaly {
  type: 'excessive_duration' | 'time_regression';
  index: number;
  id: string;
  details: string;
}

/**
 * Corrupted range detected by pattern matching
 * (excessive_duration followed by time_regression)
 */
export interface CorruptedRange {
  startIndex: number; // Index of subtitle with excessive duration
  endIndex: number; // Index before the regression point
  startId: string;
  endId: string;
  affectedCount: number;
  triggerAnomaly: TimelineAnomaly;
  recoveryAnomaly: TimelineAnomaly;
}

/**
 * Result of timeline validation
 */
export interface TimelineValidationResult {
  isValid: boolean;
  independentAnomalies: TimelineAnomaly[]; // Anomalies not part of a corrupted range
  corruptedRanges: CorruptedRange[]; // Detected corrupted patterns
}

/**
 * Validate timeline of refined subtitles
 *
 * Detection logic:
 * 1. Find all excessive_duration anomalies (>10s)
 * 2. Find all time_regression anomalies (startTime goes backwards)
 * 3. Match patterns: if excessive_duration is followed by time_regression,
 *    mark as corrupted range
 * 4. Unmatched anomalies are reported as independent
 */
export function validateTimeline(segments: SubtitleItem[]): TimelineValidationResult {
  if (segments.length === 0) {
    return { isValid: true, independentAnomalies: [], corruptedRanges: [] };
  }

  const excessiveDurationAnomalies: TimelineAnomaly[] = [];
  const regressionAnomalies: TimelineAnomaly[] = [];

  // Pass 1: Detect all anomalies
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const startSec = timeToSeconds(seg.startTime);
    const endSec = timeToSeconds(seg.endTime);
    const duration = endSec - startSec;

    // Check excessive duration
    if (duration > EXCESSIVE_DURATION_THRESHOLD) {
      excessiveDurationAnomalies.push({
        type: 'excessive_duration',
        index: i,
        id: seg.id,
        details: `Duration ${duration.toFixed(1)}s exceeds ${EXCESSIVE_DURATION_THRESHOLD}s threshold`,
      });
    }

    // Check time regression (compare with previous segment)
    if (i > 0) {
      const prevStartSec = timeToSeconds(segments[i - 1].startTime);
      if (startSec < prevStartSec - REGRESSION_THRESHOLD) {
        regressionAnomalies.push({
          type: 'time_regression',
          index: i,
          id: seg.id,
          details: `startTime ${seg.startTime} is before previous startTime ${segments[i - 1].startTime}`,
        });
      }
    }
  }

  // Pass 2: Match patterns (excessive_duration followed by time_regression)
  const corruptedRanges: CorruptedRange[] = [];
  const matchedExcessiveIndices = new Set<number>();
  const matchedRegressionIndices = new Set<number>();

  for (const excessive of excessiveDurationAnomalies) {
    // Find the first regression that comes after this excessive duration
    const matchingRegression = regressionAnomalies.find(
      (reg) => reg.index > excessive.index && !matchedRegressionIndices.has(reg.index)
    );

    if (matchingRegression) {
      // Found a pattern!
      const endIndex = matchingRegression.index - 1; // Last corrupted is before regression
      corruptedRanges.push({
        startIndex: excessive.index,
        endIndex: endIndex,
        startId: excessive.id,
        endId: segments[endIndex].id,
        affectedCount: endIndex - excessive.index + 1,
        triggerAnomaly: excessive,
        recoveryAnomaly: matchingRegression,
      });

      matchedExcessiveIndices.add(excessive.index);
      matchedRegressionIndices.add(matchingRegression.index);
    }
  }

  // Pass 3: Collect unmatched anomalies as independent
  const independentAnomalies: TimelineAnomaly[] = [
    ...excessiveDurationAnomalies.filter((a) => !matchedExcessiveIndices.has(a.index)),
    ...regressionAnomalies.filter((a) => !matchedRegressionIndices.has(a.index)),
  ];

  const isValid = corruptedRanges.length === 0 && independentAnomalies.length === 0;

  return {
    isValid,
    independentAnomalies,
    corruptedRanges,
  };
}

/**
 * Mark subtitles with regression issue (for independent regressions)
 */
export function markRegressionIssues(
  segments: SubtitleItem[],
  anomalies: TimelineAnomaly[]
): SubtitleItem[] {
  const regressionIds = new Set(
    anomalies.filter((a) => a.type === 'time_regression').map((a) => a.id)
  );

  return segments.map((seg) => ({
    ...seg,
    hasRegressionIssue: regressionIds.has(seg.id) ? true : undefined,
  }));
}

/**
 * Mark subtitles in corrupted range
 */
export function markCorruptedRange(
  segments: SubtitleItem[],
  ranges: CorruptedRange[]
): SubtitleItem[] {
  // Build set of all corrupted segment IDs
  const corruptedIds = new Set<string>();
  for (const range of ranges) {
    for (let i = range.startIndex; i <= range.endIndex && i < segments.length; i++) {
      corruptedIds.add(segments[i].id);
    }
  }

  return segments.map((seg) => ({
    ...seg,
    hasCorruptedRangeIssue: corruptedIds.has(seg.id) ? true : undefined,
  }));
}

/**
 * Strip validation fields before sending to translation LLM
 */
export function stripValidationFields(segments: SubtitleItem[]): SubtitleItem[] {
  return segments.map(
    ({
      hasRegressionIssue: _hasRegressionIssue,
      hasCorruptedRangeIssue: _hasCorruptedRangeIssue,
      ...rest
    }) => rest as SubtitleItem
  );
}
