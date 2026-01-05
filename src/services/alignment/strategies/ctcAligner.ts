/**
 * CTC Forced Alignment Strategy
 *
 * Uses external align.exe CLI tool with MMS model for precise timestamp alignment.
 * Receives pre-split segments from LLM Refinement step and only aligns timestamps.
 *
 * NOTE: This module uses child_process which only works in Node.js/Electron.
 * The spawn function is dynamically imported to avoid browser bundling issues.
 */

import { type SubtitleItem } from '@/types/subtitle';
import { type AlignmentStrategy, type CTCAlignmentConfig } from '@/types/alignment';
import { CONFIDENCE_THRESHOLD, requiresRomanization } from '@/services/alignment/utils';
import { formatTime, timeToSeconds } from '@/services/subtitle/time';
import { logger } from '@/services/utils/logger';
import { generateSubtitleId } from '@/services/utils/id';

// Re-export language utilities for backward compatibility
export { detectLanguage, iso639_1To3 } from '@/services/utils/language';

// ============================================================================
// CTC Aligner Strategy
// ============================================================================

/**
 * CTC Forced Aligner Strategy
 *
 * Receives pre-split segments from LLM Refinement step.
 * Only performs precise timestamp alignment, no splitting or merging.
 */
export class CTCAligner implements AlignmentStrategy {
  readonly name = 'ctc' as const;

  constructor(private config: CTCAlignmentConfig) {}

  async align(
    segments: SubtitleItem[],
    audioPath: string,
    language: string,
    context?: any,
    _audioBase64?: string
  ): Promise<SubtitleItem[]> {
    // Skip if no segments
    if (segments.length === 0) {
      return segments;
    }

    // Check if electronAPI is available
    if (!window.electronAPI?.alignment) {
      logger.error('CTC Aligner: electronAPI.alignment not available');
      throw new Error('CTC alignment requires Electron environment');
    }

    // Check for abort before starting
    if (context?.signal?.aborted) {
      throw new Error('Alignment cancelled');
    }

    // Prepare segments for alignment (no splitting, no merging)
    // LLM Refinement already split the segments appropriately
    const alignmentSegments = segments.map((seg, index) => ({
      index,
      text: seg.original,
      start: timeToSeconds(seg.startTime),
      end: timeToSeconds(seg.endTime),
    }));

    try {
      logger.info(`CTC Aligner: Starting alignment for ${segments.length} segments`);

      // Set up abort handling
      let abortPromise: Promise<never> | null = null;
      if (context?.signal) {
        abortPromise = new Promise<never>((_, reject) => {
          const onAbort = () => {
            void window.electronAPI.alignment.ctcAbort();
            reject(new Error('Alignment cancelled'));
          };
          if (context.signal.aborted) {
            onAbort();
          } else {
            context.signal.addEventListener('abort', onAbort, { once: true });
          }
        });
      }

      // Call main process via IPC
      const ipcPromise = window.electronAPI.alignment.ctc({
        segments: alignmentSegments,
        audioPath,
        language,
        config: {
          alignerPath: this.config.alignerPath,
          modelPath: this.config.modelPath,
          batchSize: this.config.batchSize,
          romanize: requiresRomanization(language),
        },
      });

      // Race between alignment and abort
      const result =
        abortPromise !== null ? await Promise.race([ipcPromise, abortPromise]) : await ipcPromise;

      if (!result.success) {
        throw new Error(result.error || 'Alignment failed');
      }

      logger.info(
        `CTC Aligner: Aligned ${result.metadata?.count || result.segments?.length} segments` +
          (result.metadata?.processing_time
            ? ` in ${result.metadata.processing_time.toFixed(2)}s`
            : '')
      );

      // Map aligned segments back to SubtitleItem format
      return this.mapAlignedSegments(segments, result.segments || []);
    } catch (error: any) {
      logger.error(`CTC Aligner failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Map aligned segments to SubtitleItem format.
   * Preserves original segment data, only updates timestamps.
   */
  private mapAlignedSegments(
    originalSegments: SubtitleItem[],
    alignedSegments: { index: number; start: number; end: number; text: string; score: number }[]
  ): SubtitleItem[] {
    return alignedSegments.map((aligned, idx) => {
      const original = originalSegments[idx];
      if (!original) {
        logger.warn(`CTC Aligner: No original segment for aligned index ${idx}`);
        return {
          id: generateSubtitleId(),
          original: aligned.text,
          translated: '',
          startTime: formatTime(aligned.start),
          endTime: formatTime(aligned.end),
          alignmentScore: aligned.score,
          lowConfidence: aligned.score < CONFIDENCE_THRESHOLD,
        };
      }

      return {
        // Preserve all original fields
        ...original,
        // Update timestamps from alignment
        startTime: formatTime(aligned.start),
        endTime: formatTime(aligned.end),
        // Add alignment metadata
        alignmentScore: aligned.score,
        lowConfidence: aligned.score < CONFIDENCE_THRESHOLD,
      };
    });
  }
}
