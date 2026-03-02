import { logger } from '@/services/utils/logger';

export interface SegmentationOptions {
  minDurationMs?: number;
  maxDurationMs?: number;
  silenceThreshold?: number;
  signal?: AbortSignal;
}

export class SmartSegmenter {
  private static instance: SmartSegmenter;

  public constructor() {}

  public static getInstance(): SmartSegmenter {
    if (!SmartSegmenter.instance) {
      SmartSegmenter.instance = new SmartSegmenter();
    }
    return SmartSegmenter.instance;
  }

  /**
   * Dispose the singleton instance and release resources.
   * Should be called at the end of processing pipeline.
   */
  public static disposeInstance(): void {
    if (SmartSegmenter.instance) {
      // No resources to clean up anymore (native VAD doesn't need cleanup)
      // Clear the static reference to allow garbage collection
      SmartSegmenter.instance = undefined as unknown as SmartSegmenter;
      logger.debug('SmartSegmenter singleton instance disposed');
    }
  }

  /**
   * Segment audio into chunks of approximately targetDuration seconds,
   * trying to cut at silence/natural pauses.
   *
   * @returns Object containing chunks and VAD segments (for caching/reuse)
   */
  public async segmentAudio(
    audioBuffer: AudioBuffer,
    targetDurationSec: number,
    signal?: AbortSignal
  ): Promise<{
    chunks: { start: number; end: number }[];
    vadSegments: { start: number; end: number }[];
  }> {
    // 1. Get speech segments (where speech IS happening)
    // We use a smaller minDuration to detect even short pauses
    const speechSegments = await this.analyzeAudio(audioBuffer, { minDurationMs: 500, signal });

    // 2. Create smart chunks based on VAD segments
    const chunks = SmartSegmenter.createChunksFromVadSegments(
      speechSegments,
      audioBuffer.duration,
      targetDurationSec
    );

    logger.debug(`Segmented audio into ${chunks.length} chunks.`);

    // Return both chunks and VAD segments for caching
    return {
      chunks,
      vadSegments: speechSegments,
    };
  }

  /**
   * Create smart chunks from VAD segments.
   * This is a static method so it can be reused for long videos without loading AudioBuffer.
   */
  public static createChunksFromVadSegments(
    speechSegments: { start: number; end: number }[],
    totalDuration: number,
    targetDurationSec: number
  ): { start: number; end: number }[] {
    const chunks: { start: number; end: number }[] = [];
    let currentChunkStart = 0;

    while (currentChunkStart < totalDuration) {
      let targetEnd = currentChunkStart + targetDurationSec;

      if (targetEnd >= totalDuration) {
        chunks.push({ start: currentChunkStart, end: totalDuration });
        break;
      }

      // Find the best split point near targetEnd
      let bestSplitPoint = targetEnd;
      let minDistance = Infinity;

      // Search window: +/- 10% of target duration or 30 seconds
      const searchWindow = Math.min(targetDurationSec * 0.1, 30);
      const searchStart = Math.max(currentChunkStart + 10, targetEnd - searchWindow);
      const searchEnd = Math.min(totalDuration, targetEnd + searchWindow);

      let foundGap = false;

      // Optimization: Filter segments relevant to our search window
      const relevantSegments = speechSegments.filter(
        (s) => s.end > searchStart && s.start < searchEnd
      );

      if (relevantSegments.length === 0) {
        // No speech in window? Great, cut exactly at targetEnd
        bestSplitPoint = targetEnd;
        foundGap = true;
      } else {
        // Check gaps between relevant segments
        for (let i = 0; i < relevantSegments.length - 1; i++) {
          const gapStart = relevantSegments[i].end;
          const gapEnd = relevantSegments[i + 1].start;

          if (gapStart >= searchStart && gapEnd <= searchEnd) {
            // Found a gap fully within window
            const gapMid = (gapStart + gapEnd) / 2;
            // Prefer split closest to targetEnd
            if (Math.abs(gapMid - targetEnd) < minDistance) {
              minDistance = Math.abs(gapMid - targetEnd);
              bestSplitPoint = gapMid;
              foundGap = true;
            }
          }
        }

        // Check gap before first segment if it starts after searchStart
        if (relevantSegments[0].start > searchStart) {
          const split = relevantSegments[0].start - 0.1;
          if (Math.abs(split - targetEnd) < minDistance) {
            minDistance = Math.abs(split - targetEnd);
            bestSplitPoint = split;
            foundGap = true;
          }
        }

        // Check gap after last segment if it ends before searchEnd
        if (relevantSegments[relevantSegments.length - 1].end < searchEnd) {
          const split = relevantSegments[relevantSegments.length - 1].end + 0.1;
          if (Math.abs(split - targetEnd) < minDistance) {
            minDistance = Math.abs(split - targetEnd);
            bestSplitPoint = split;
            foundGap = true;
          }
        }
      }

      if (!foundGap) {
        // If no silence found, hard cut at targetEnd
        bestSplitPoint = targetEnd;
      }

      if (bestSplitPoint !== targetEnd) {
        logger.debug(
          `Smart split found at ${bestSplitPoint.toFixed(2)}s (Target: ${targetEnd.toFixed(2)}s, Gap: ${foundGap})`
        );
      } else if (!foundGap) {
        logger.debug(`No smart split found near ${targetEnd.toFixed(2)}s, hard cutting.`);
      }

      chunks.push({ start: currentChunkStart, end: bestSplitPoint });
      currentChunkStart = bestSplitPoint;
    }

    // Post-processing: Merge very short trailing chunks
    // If the last chunk is too short (< 30s), merge it with the previous chunk
    const MIN_CHUNK_DURATION = 30;
    if (chunks.length > 1) {
      const lastChunk = chunks[chunks.length - 1];
      const lastChunkDuration = lastChunk.end - lastChunk.start;
      if (lastChunkDuration < MIN_CHUNK_DURATION) {
        logger.debug(
          `Last chunk too short (${lastChunkDuration.toFixed(2)}s < ${MIN_CHUNK_DURATION}s), merging with previous chunk.`
        );
        // Remove last chunk and extend previous chunk to total duration
        chunks.pop();
        chunks[chunks.length - 1].end = totalDuration;
      }
    }

    return chunks;
  }

  private worker: Worker | null = null;
  private workerReadyPromise: Promise<void> | null = null;

  /**
   * Analyze audio buffer and return speech segments using Silero VAD (via Web Worker)
   */
  public async analyzeAudio(
    audioBuffer: AudioBuffer,
    options: SegmentationOptions = {}
  ): Promise<{ start: number; end: number }[]> {
    logger.debug('analyzeAudio called', {
      duration: audioBuffer.duration,
      sampleRate: audioBuffer.sampleRate,
      numberOfChannels: audioBuffer.numberOfChannels,
      options,
    });

    // Check if running in Electron and native VAD is available
    if (window.electronAPI?.nativeVadAnalyze) {
      logger.debug('Using native VAD (Electron mode)');
      return this.analyzeAudioNative(audioBuffer, options);
    }

    // Fallback to energy-based segmentation for web mode
    logger.debug('Using energy-based segmentation (web mode or native VAD unavailable)');
    const audioData = audioBuffer.getChannelData(0);
    return this.energyBasedSegmentation(
      audioData,
      audioBuffer.sampleRate,
      options.minDurationMs || 1000
    );
  }

  /**
   * Analyze audio using native VAD (Electron only)
   */
  private async analyzeAudioNative(
    audioBuffer: AudioBuffer,
    options: SegmentationOptions = {}
  ): Promise<{ start: number; end: number }[]> {
    // Early abort check before doing any work
    if (options.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    try {
      // Write AudioBuffer to temporary WAV file
      const wavBlob = await this.audioBufferToWav(audioBuffer);
      const wavArrayBuffer = await wavBlob.arrayBuffer();

      // Write to temp file via IPC
      const tempResult = await window.electronAPI.writeTempAudioFile(wavArrayBuffer, 'wav');
      if (!tempResult.success || !tempResult.path) {
        throw new Error('Failed to write temporary audio file');
      }

      const tempPath = tempResult.path;
      logger.debug(`Temporary audio file created: ${tempPath}`);

      let abortListener: (() => void) | null = null;
      try {
        // Wire abort signal to stop the native process if cancelled
        if (options.signal) {
          abortListener = () => void window.electronAPI.nativeVadAbort();
          options.signal.addEventListener('abort', abortListener);
        }

        // Call native VAD via IPC
        const vadOptions = {
          threshold: 0.6, // Slightly higher than default for better precision
          minSpeechDurationMs: options.minDurationMs || 250,
          minSilenceDurationMs: 100,
          speechPadMs: 30,
        };

        const startTime = performance.now();
        const result = await window.electronAPI.nativeVadAnalyze(tempPath, vadOptions);
        const duration = performance.now() - startTime;

        if (!result.success || !result.segments) {
          throw new Error(result.error || 'Native VAD analysis failed');
        }

        logger.debug(
          `Native VAD completed in ${duration.toFixed(2)}ms. Found ${result.segments.length} speech segments.`
        );

        return result.segments;
      } finally {
        if (abortListener && options.signal) {
          options.signal.removeEventListener('abort', abortListener);
        }
        // Cleanup temp file
        try {
          await window.electronAPI.cleanupTempAudio(tempPath);
        } catch (cleanupError) {
          logger.warn('Failed to cleanup temp audio file:', cleanupError);
        }
      }
    } catch (error) {
      // Rethrow abort/cancellation errors — do NOT fall back to energy segmentation
      if (options.signal?.aborted) {
        throw error;
      }
      logger.error('Native VAD failed, falling back to energy-based segmentation:', error);
      // Fallback to energy-based segmentation
      const audioData = audioBuffer.getChannelData(0);
      return this.energyBasedSegmentation(
        audioData,
        audioBuffer.sampleRate,
        options.minDurationMs || 1000
      );
    }
  }

  /**
   * Convert AudioBuffer to WAV blob
   */
  private async audioBufferToWav(audioBuffer: AudioBuffer): Promise<Blob> {
    const numberOfChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const length = audioBuffer.length * numberOfChannels * 2; // 16-bit samples
    const buffer = new ArrayBuffer(44 + length);
    const view = new DataView(buffer);

    // WAV header
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // fmt chunk size
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, numberOfChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numberOfChannels * 2, true); // byte rate
    view.setUint16(32, numberOfChannels * 2, true); // block align
    view.setUint16(34, 16, true); // bits per sample
    writeString(36, 'data');
    view.setUint32(40, length, true);

    // Write audio data
    const offset = 44;
    const channels: Float32Array[] = [];
    for (let i = 0; i < numberOfChannels; i++) {
      channels.push(audioBuffer.getChannelData(i));
    }

    let index = 0;
    for (let i = 0; i < audioBuffer.length; i++) {
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const sample = Math.max(-1, Math.min(1, channels[channel][i]));
        view.setInt16(offset + index, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        index += 2;
      }
    }

    return new Blob([buffer], { type: 'audio/wav' });
  }

  private energyBasedSegmentation(
    data: Float32Array,
    sampleRate: number,
    minDurationMs: number
  ): { start: number; end: number }[] {
    const segments: { start: number; end: number }[] = [];
    const frameSize = Math.floor(sampleRate * 0.02); // 20ms frames

    // 1. Calculate RMS energy per frame
    const energies: number[] = [];
    let maxEnergy = 0;

    for (let i = 0; i < data.length; i += frameSize) {
      let sum = 0;
      let count = 0;
      for (let j = 0; j < frameSize && i + j < data.length; j++) {
        sum += data[i + j] * data[i + j];
        count++;
      }
      const rms = Math.sqrt(sum / count);
      energies.push(rms);
      if (rms > maxEnergy) maxEnergy = rms;
    }

    // 2. Normalize and apply thresholds
    // Dynamic threshold: 5% of max energy or 0.005, whichever is higher
    const speechThreshold = Math.max(maxEnergy * 0.05, 0.005);
    const silenceThreshold = speechThreshold * 0.4; // Hysteresis

    let isSpeaking = false;
    let startFrame = 0;
    let silenceFrames = 0;
    const minSpeechFrames = Math.ceil((minDurationMs / 1000) * (sampleRate / frameSize));
    const maxSilenceFrames = Math.ceil(0.5 * (sampleRate / frameSize)); // 500ms tolerance

    for (let i = 0; i < energies.length; i++) {
      const energy = energies[i];

      if (!isSpeaking) {
        if (energy > speechThreshold) {
          isSpeaking = true;
          startFrame = i;
          silenceFrames = 0;
        }
      } else {
        if (energy < silenceThreshold) {
          silenceFrames++;
          if (silenceFrames > maxSilenceFrames) {
            // End of segment
            const endFrame = i - silenceFrames;
            if (endFrame - startFrame >= minSpeechFrames) {
              segments.push({
                start: (startFrame * frameSize) / sampleRate,
                end: (endFrame * frameSize) / sampleRate,
              });
            }
            isSpeaking = false;
            silenceFrames = 0;
          }
        } else {
          silenceFrames = 0;
        }
      }
    }

    // Handle last segment
    if (isSpeaking) {
      const endFrame = energies.length;
      if (endFrame - startFrame >= minSpeechFrames) {
        segments.push({
          start: (startFrame * frameSize) / sampleRate,
          end: (endFrame * frameSize) / sampleRate,
        });
      }
    }

    return segments;
  }
}
