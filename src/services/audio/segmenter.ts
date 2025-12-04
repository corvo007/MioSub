// Removed imports to use global script tags
// import { NonRealTimeVAD, utils } from "@ricky0123/vad-web";
// import * as ort from "onnxruntime-web";

import { SubtitleItem } from "@/types/subtitle";
import { logger } from "@/services/utils/logger";

export interface SegmentationOptions {
    minDurationMs?: number;
    maxDurationMs?: number;
    silenceThreshold?: number;
    signal?: AbortSignal;
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
     * 
     * @returns Object containing chunks and VAD segments (for caching/reuse)
     */
    public async segmentAudio(
        audioBuffer: AudioBuffer,
        targetDurationSec: number,
        signal?: AbortSignal
    ): Promise<{
        chunks: { start: number; end: number }[],
        vadSegments: { start: number; end: number }[]
    }> {
        // 1. Get speech segments (where speech IS happening)
        // We use a smaller minDuration to detect even short pauses
        const speechSegments = await this.analyzeAudio(audioBuffer, { minDurationMs: 500, signal });

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

        logger.debug(`Segmented audio into ${chunks.length} chunks.`);

        // Return both chunks and VAD segments for caching
        return {
            chunks,
            vadSegments: speechSegments
        };
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
        logger.debug("analyzeAudio called", {
            duration: audioBuffer.duration,
            sampleRate: audioBuffer.sampleRate,
            numberOfChannels: audioBuffer.numberOfChannels,
            options
        });

        // Convert AudioBuffer to Float32Array (mono)
        const audioData = audioBuffer.getChannelData(0);

        try {
            logger.debug("Initializing VAD Worker...");
            const startTime = performance.now();

            if (!this.worker) {
                // Initialize worker
                // Note: The worker file is still in public/ or src/workers/ ?
                // The original code used new URL('./workers/vad.worker.ts', import.meta.url)
                // We need to make sure this path is still valid relative to the new file location.
                // New file: src/services/audio/segmenter.ts
                // Worker: src/workers/vad.worker.ts (assuming)
                // Relative path: ../../workers/vad.worker.ts

                this.worker = new Worker(new URL('../../workers/vad.worker.ts', import.meta.url), {
                    type: 'classic' // Use classic to allow importScripts
                });

                this.workerReadyPromise = new Promise((resolve, reject) => {
                    if (!this.worker) return reject("Worker not created");

                    const handleInitMessage = (e: MessageEvent) => {
                        if (e.data.type === 'ready') {
                            this.worker?.removeEventListener('message', handleInitMessage);
                            resolve();
                        } else if (e.data.type === 'error') {
                            this.worker?.removeEventListener('message', handleInitMessage);
                            const errorDetails = {
                                message: e.data.message,
                                stack: e.data.stack,
                                details: e.data.details
                            };
                            logger.error("VAD Worker initialization error details:", errorDetails);
                            reject(new Error(e.data.message));
                        }
                    };
                    this.worker.addEventListener('message', handleInitMessage);

                    // Calculate base URL for script loading (handles both dev and prod/electron)
                    // In Electron, we need to use the file:// protocol base path
                    let baseUrl: string;

                    // Check if running in Electron
                    if (window.electronAPI) {
                        // In Electron, use the current location without query/hash
                        baseUrl = window.location.href.split('?')[0].split('#')[0];
                        if (!baseUrl.endsWith('/')) {
                            baseUrl = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);
                        }

                        // Fix for ASAR unpacked resources
                        // ONNX Runtime cannot load files from within ASAR archives
                        // We unpacked them to app.asar.unpacked, so we need to point there
                        if (baseUrl.includes('app.asar')) {
                            baseUrl = baseUrl.replace('app.asar', 'app.asar.unpacked');
                            logger.debug("Adjusted base URL for unpacked ASAR resources:", baseUrl);
                        }

                        logger.debug("Electron environment detected, using base URL:", baseUrl);
                    } else {
                        // In web browser, use the standard method
                        baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);
                        logger.debug("Web environment detected, using base URL:", baseUrl);
                    }

                    this.worker.postMessage({
                        command: 'init',
                        base: baseUrl,
                        options: {
                            positiveSpeechThreshold: 0.6,
                            negativeSpeechThreshold: 0.4,
                            minSpeechFrames: 4,
                            redemptionFrames: 8, // ~250ms silence ends segment
                            preSpeechPadFrames: 1,
                            // Explicitly set URLs using the calculated base URL
                            // NonRealTimeVAD only supports legacy model in this version
                            modelURL: new URL('silero_vad_legacy.onnx', baseUrl).href,
                            workletURL: new URL('vad.worklet.bundle.min.js', baseUrl).href,
                        }
                    });
                });
            }

            await this.workerReadyPromise;
            const initTime = performance.now() - startTime;
            logger.debug(`VAD Worker initialized in ${initTime.toFixed(2)}ms`);

            // Run VAD via worker
            return new Promise((resolve, reject) => {
                if (!this.worker) return reject("Worker not available");
                if (options.signal?.aborted) return reject(new Error('操作已取消'));

                const handleProcessMessage = (e: MessageEvent) => {
                    const msg = e.data;
                    if (msg.type === 'result') {
                        cleanup();
                        const runTime = performance.now() - startTime - initTime;
                        logger.debug(`VAD execution complete in ${runTime.toFixed(2)}ms. Found ${msg.segments.length} speech segments.`);
                        resolve(msg.segments);
                    } else if (msg.type === 'progress') {
                        logger.debug(`VAD Progress: ${msg.processed} segments (Latest: ${msg.latestTime.toFixed(2)}s)`);
                    } else if (msg.type === 'error') {
                        cleanup();
                        const errorDetails = {
                            message: msg.message,
                            stack: msg.stack,
                            details: msg.details
                        };
                        logger.error("VAD Worker processing error details:", errorDetails);
                        reject(new Error(msg.message));
                    }
                };

                const onAbort = () => {
                    cleanup();
                    reject(new Error('操作已取消'));
                };

                const cleanup = () => {
                    this.worker?.removeEventListener('message', handleProcessMessage);
                    options.signal?.removeEventListener('abort', onAbort);
                };

                this.worker.addEventListener('message', handleProcessMessage);
                options.signal?.addEventListener('abort', onAbort);

                // Send process command
                this.worker.postMessage({
                    command: 'process',
                    audioData: audioData,
                    sampleRate: audioBuffer.sampleRate
                });
            });

        } catch (e) {
            logger.error("Silero VAD failed initialization or execution", {
                error: e,
                message: e instanceof Error ? e.message : String(e),
                stack: e instanceof Error ? e.stack : undefined
            });
            logger.warn("Falling back to energy-based segmentation due to VAD error");
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
