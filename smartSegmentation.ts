import { NonRealTimeVAD, utils } from "@ricky0123/vad-web";
import { SubtitleItem } from "./types";
import { logger } from "./utils";

export interface SegmentationOptions {
    minDurationMs?: number;
    maxDurationMs?: number;
    silenceThreshold?: number;
}

export class SmartSegmenter {
    private static instance: SmartSegmenter;

    public constructor() { }

    public static getInstance(): SmartSegmenter {
        if (!SmartSegmenter.instance) {
            SmartSegmenter.instance = new SmartSegmenter();
        }
        return SmartSegmenter.instance;
    }

    /**
     * Segment audio into chunks of approximately targetDuration seconds,
     * trying to cut at silence/natural pauses.
     */
    public async segmentAudio(
        audioBuffer: AudioBuffer,
        targetDurationSec: number
    ): Promise<{ start: number; end: number }[]> {
        // 1. Get speech segments (where speech IS happening)
        // We use a smaller minDuration to detect even short pauses
        const speechSegments = await this.analyzeAudio(audioBuffer, { minDurationMs: 500 });

        const chunks: { start: number; end: number }[] = [];
        const totalDuration = audioBuffer.duration;

        let currentChunkStart = 0;

        while (currentChunkStart < totalDuration) {
            let targetEnd = currentChunkStart + targetDurationSec;

            if (targetEnd >= totalDuration) {
                chunks.push({ start: currentChunkStart, end: totalDuration });
                break;
            }

            // Find the best split point near targetEnd
            // We look for a silence gap. 
            // A silence gap exists BETWEEN speech segments.

            // Find a speech segment that overlaps with targetEnd
            // or the first one that starts after it.

            let bestSplitPoint = targetEnd;
            let minDistance = Infinity;

            // Search window: +/- 10% of target duration or 30 seconds
            const searchWindow = Math.min(targetDurationSec * 0.1, 30);
            const searchStart = Math.max(currentChunkStart + 10, targetEnd - searchWindow);
            const searchEnd = Math.min(totalDuration, targetEnd + searchWindow);

            // We want to find a point t in [searchStart, searchEnd] such that t is NOT inside a speech segment.
            // And ideally in the middle of a silence gap.

            // Flatten speech segments to just a list of "busy" intervals
            // We iterate to find gaps.

            let foundGap = false;

            // Optimization: Filter segments relevant to our search window
            const relevantSegments = speechSegments.filter(s => s.end > searchStart && s.start < searchEnd);

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
                    const gapMid = (searchStart + relevantSegments[0].start) / 2; // Rough approx
                    // Actually, we can cut anywhere before the segment starts.
                    // Let's cut right before the segment starts.
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
                // If no silence found, we must cut mid-speech (unfortunate)
                // or we extend to the nearest silence if allowed?
                // For now, hard cut at targetEnd
                bestSplitPoint = targetEnd;
            }

            if (bestSplitPoint !== targetEnd) {
                logger.debug(`Smart split found at ${bestSplitPoint.toFixed(2)}s (Target: ${targetEnd.toFixed(2)}s, Gap: ${foundGap})`);
            } else if (!foundGap) {
                logger.debug(`No smart split found near ${targetEnd.toFixed(2)}s, hard cutting.`);
            }

            chunks.push({ start: currentChunkStart, end: bestSplitPoint });
            currentChunkStart = bestSplitPoint;
        }

        return chunks;
    }

    /**
     * Analyze audio buffer and return speech segments using Silero VAD
     */
    public async analyzeAudio(
        audioBuffer: AudioBuffer,
        options: SegmentationOptions = {}
    ): Promise<{ start: number; end: number }[]> {
        // Convert AudioBuffer to Float32Array (mono)
        const audioData = audioBuffer.getChannelData(0);

        try {
            logger.debug("Initializing Silero VAD...");
            const vad = await NonRealTimeVAD.new();

            const segments: { start: number; end: number }[] = [];

            logger.debug("Running VAD on audio data...");
            // vad.run returns an async iterator
            for await (const { start, end } of vad.run(audioData, audioBuffer.sampleRate)) {
                // VAD returns timestamps in milliseconds, we need seconds
                segments.push({
                    start: start / 1000,
                    end: end / 1000
                });
            }

            logger.debug(`VAD complete. Found ${segments.length} speech segments.`);
            return segments;

        } catch (e) {
            logger.warn("Silero VAD failed, falling back to energy-based segmentation:", e);
            // Fallback to energy-based if VAD fails (e.g. model download error)
            return this.energyBasedSegmentation(audioData, audioBuffer.sampleRate, options.minDurationMs || 1000);
        }
    }

    private energyBasedSegmentation(data: Float32Array, sampleRate: number, minDurationMs: number): { start: number; end: number }[] {
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
                                end: (endFrame * frameSize) / sampleRate
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
                    end: (endFrame * frameSize) / sampleRate
                });
            }
        }

        return segments;
    }
}
