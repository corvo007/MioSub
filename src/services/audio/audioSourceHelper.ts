/**
 * Audio Source Helper
 *
 * Provides a unified interface for getting audio segments from either:
 * - In-memory AudioBuffer (standard mode)
 * - On-demand FFmpeg extraction (long video mode)
 *
 * This eliminates code duplication across pipeline steps.
 */

import { sliceAudioBuffer } from '@/services/audio/processor';
import { extractSegmentAsBlob } from '@/services/audio/segmentExtractor';

export interface AudioSourceOptions {
  /** In-memory audio buffer (null for long video mode) */
  audioBuffer: AudioBuffer | null;
  /** Path to video file (required for long video mode) */
  videoPath?: string;
  /** Whether we're in long video mode */
  isLongVideo?: boolean;
}

/**
 * Get an audio segment as a Blob from the appropriate source.
 *
 * In standard mode, slices from the in-memory AudioBuffer.
 * In long video mode, extracts on-demand via FFmpeg.
 *
 * @param options - Audio source configuration
 * @param start - Start time in seconds
 * @param end - End time in seconds
 * @param context - Optional context string for error messages (e.g., "transcription", "refinement")
 * @returns WAV audio blob
 * @throws Error if no audio source is available
 */
export async function getAudioSegment(
  options: AudioSourceOptions,
  start: number,
  end: number,
  context?: string
): Promise<Blob> {
  const { audioBuffer, videoPath, isLongVideo } = options;
  const contextStr = context ? ` for ${context}` : '';

  // Validate time range
  if (start >= end) {
    throw new Error(`Invalid time range: start (${start}s) >= end (${end}s)${contextStr}`);
  }

  if (isLongVideo && videoPath) {
    // Long video mode: extract segment on-demand via FFmpeg
    const duration = end - start;
    return extractSegmentAsBlob(videoPath, start, duration);
  } else if (audioBuffer) {
    // Standard mode: slice from in-memory AudioBuffer
    return sliceAudioBuffer(audioBuffer, start, end);
  } else if (isLongVideo && !videoPath) {
    throw new Error(`Long video mode requires videoPath${contextStr}`);
  } else {
    throw new Error(`No audio source available${contextStr}`);
  }
}

/**
 * Check if we have a valid audio source available.
 *
 * @param options - Audio source configuration
 * @returns true if audio can be extracted
 */
export function hasAudioSource(options: AudioSourceOptions): boolean {
  const { audioBuffer, videoPath, isLongVideo } = options;
  return !!(audioBuffer || (isLongVideo && videoPath));
}
