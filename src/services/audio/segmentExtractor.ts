/**
 * Segment Extractor Service
 *
 * Provides on-demand audio segment extraction for long videos (>2h)
 * to avoid OOM issues from loading entire audio into memory.
 */

import { logger } from '@/services/utils/logger';

/** Threshold for long video detection (2 hours in seconds) */
export const LONG_VIDEO_THRESHOLD = 7200;

/**
 * Extract a specific audio segment from a video file as a Blob.
 * Uses FFmpeg via Electron IPC for on-demand extraction.
 *
 * @param videoPath - Path to the video file
 * @param startTime - Start time in seconds
 * @param duration - Duration in seconds
 * @returns WAV audio blob
 */
export async function extractSegmentAsBlob(
  videoPath: string,
  startTime: number,
  duration: number
): Promise<Blob> {
  // Check if we're in Electron environment
  if (!window.electronAPI?.extractAudioSegment) {
    throw new Error('extractSegmentAsBlob is only available in Electron environment');
  }

  logger.debug(`Extracting audio segment: start=${startTime}s, duration=${duration}s`);

  // 1. Call IPC to extract segment
  const result = await window.electronAPI.extractAudioSegment(videoPath, {
    startTime,
    duration,
    format: 'wav',
    sampleRate: 16000,
    channels: 1,
  });

  if (!result.success || !result.audioPath) {
    throw new Error(result.error || 'Failed to extract audio segment');
  }

  // 2. Read the extracted audio file
  const arrayBuffer = await window.electronAPI.readExtractedAudio(result.audioPath);

  // 3. Clean up temporary file
  await window.electronAPI.cleanupTempAudio(result.audioPath);

  logger.debug(`Segment extracted successfully: ${arrayBuffer.byteLength} bytes`);

  // 4. Return as Blob
  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

/**
 * Check if a video is considered "long" based on duration threshold.
 *
 * @param duration - Video duration in seconds
 * @returns true if video exceeds LONG_VIDEO_THRESHOLD
 */
export function isLongVideo(duration: number): boolean {
  return duration > LONG_VIDEO_THRESHOLD;
}
