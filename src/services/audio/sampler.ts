import { sliceAudioBuffer, mergeAudioBuffers, extractBufferSlice, audioBufferToWav } from "./processor";
import { logger } from "@/services/utils/logger";
import { SmartSegmenter } from './segmenter';

interface AudioSample {
    startTime: number;
    endTime: number;
    duration: number;
    hasVoice: boolean;
    energyLevel: number;
}

/**
 * Intelligent audio sampling for speaker profile extraction.
 * Selects representative segments from different parts of the audio.
 * 
 * @param audioBuffer Full audio buffer
 * @param targetDuration Target total duration in seconds (default: 300s / 5min)
 * @param sampleCount Number of samples to extract (default: 8)
 * @param signal Optional AbortSignal for cancellation support
 * @param cachedVadSegments Optional pre-computed VAD segments (from segmentation) to avoid re-running VAD
 * @returns Object containing the merged audio blob and its duration
 */
export async function intelligentAudioSampling(
    audioBuffer: AudioBuffer,
    targetDuration: number = 300,
    sampleCount: number = 8,
    signal?: AbortSignal,
    cachedVadSegments?: { start: number, end: number }[]
): Promise<{ blob: Blob, duration: number }> {
    logger.info(`Starting intelligent audio sampling (Target: ${targetDuration}s, Count: ${sampleCount}, Cached VAD: ${!!cachedVadSegments})`);

    // Check cancellation before starting
    if (signal?.aborted) {
        throw new Error('Operation cancelled');
    }

    // 1. Detect voice activity (use cached if available, otherwise run VAD)
    let segments: AudioSample[];

    if (cachedVadSegments) {
        logger.info(`Using cached VAD segments (${cachedVadSegments.length} segments), skipping VAD analysis`);
        // Convert cached segments to AudioSample format
        segments = cachedVadSegments.map(seg => ({
            startTime: seg.start,
            endTime: seg.end,
            duration: seg.end - seg.start,
            hasVoice: true,
            energyLevel: 1 // Placeholder, not used for cached segments
        }));
    } else {
        logger.info("No cached VAD segments, running VAD analysis");
        const rawSegments = await analyzeAudioSegments(audioBuffer);
        segments = rawSegments;
    }

    // Check cancellation after VAD analysis
    if (signal?.aborted) {
        throw new Error('Operation cancelled');
    }

    // 2. Filter valid segments (>= 5 seconds)
    const validSegments = segments.filter(s => s.duration >= 5);

    if (validSegments.length === 0) {
        logger.warn("No valid voice segments found, falling back to uniform sampling");
        // Fallback: slice the first 'targetDuration' seconds
        const duration = Math.min(audioBuffer.duration, targetDuration);
        const blob = await sliceAudioBuffer(audioBuffer, 0, duration);
        return { blob, duration };
    }

    // 3. Select representative samples from different zones
    const selectedSamples = selectRepresentativeSamples(
        validSegments,
        audioBuffer.duration,
        sampleCount
    );

    logger.info(`Selected ${selectedSamples.length} samples for profile extraction`);

    // Check cancellation before extraction
    if (signal?.aborted) {
        throw new Error('Operation cancelled');
    }

    // 4. Extract and merge segments
    const buffers: AudioBuffer[] = [];

    for (const sample of selectedSamples) {
        // Check cancellation in loop
        if (signal?.aborted) {
            throw new Error('Operation cancelled');
        }

        const sampleBuffer = extractBufferSlice(audioBuffer, sample.startTime, sample.endTime);
        buffers.push(sampleBuffer);
    }

    // Merge all buffers
    const mergedBuffer = mergeAudioBuffers(buffers, audioBuffer.sampleRate);

    // Convert final merged buffer to Blob
    return {
        blob: audioBufferToWav(mergedBuffer),
        duration: mergedBuffer.duration
    };
}

/**
 * Analyzes audio to find segments with potential voice activity.
 * Uses Silero VAD via SmartSegmenter for accurate detection.
 * Falls back to energy-based detection if VAD fails.
 */
async function analyzeAudioSegments(audioBuffer: AudioBuffer): Promise<AudioSample[]> {
    try {
        // Use SmartSegmenter's professional Silero VAD
        const segmenter = SmartSegmenter.getInstance();
        const speechSegments = await segmenter.analyzeAudio(audioBuffer, {
            minDurationMs: 500 // At least 500ms voice segments
        });

        logger.info(`Silero VAD detected ${speechSegments.length} speech segments`);

        // Convert format
        const converted = speechSegments.map(seg => ({
            startTime: seg.start,
            endTime: seg.end,
            duration: seg.end - seg.start,
            hasVoice: true,
            energyLevel: 1 // VAD doesn't provide energy, use fixed value
        }));

        return mergeAdjacentSegments(converted);

    } catch (e) {
        logger.warn("Silero VAD failed, falling back to energy-based detection", e);
        return energyBasedDetection(audioBuffer);
    }
}

/**
 * Fallback energy-based voice detection with dynamic threshold (fixes M6)
 */
function energyBasedDetection(audioBuffer: AudioBuffer): AudioSample[] {
    const segments: AudioSample[] = [];
    const channelData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;
    const windowSize = sampleRate * 1;

    // First pass: calculate all energy values
    const energies: number[] = [];
    for (let i = 0; i < channelData.length; i += windowSize) {
        let sum = 0;
        const end = Math.min(i + windowSize, channelData.length);
        for (let j = i; j < end; j++) {
            sum += Math.abs(channelData[j]);
        }
        energies.push(sum / (end - i));
    }

    // Dynamic threshold: use median * 0.2 (fixes M6 hardcoded 0.01 issue)
    const sortedEnergies = [...energies].sort((a, b) => a - b);
    const median = sortedEnergies[Math.floor(sortedEnergies.length / 2)] || 0.01;
    const threshold = Math.max(median * 0.2, 0.005);

    logger.debug(`Energy-based VAD - threshold: ${threshold.toFixed(4)}, median: ${median.toFixed(4)}`);

    // Second pass: detect voice using dynamic threshold
    for (let i = 0; i < channelData.length; i += windowSize) {
        let sum = 0;
        const end = Math.min(i + windowSize, channelData.length);
        for (let j = i; j < end; j++) {
            sum += Math.abs(channelData[j]);
        }
        const avgEnergy = sum / (end - i);

        if (avgEnergy > threshold) {
            segments.push({
                startTime: i / sampleRate,
                endTime: end / sampleRate,
                duration: (end - i) / sampleRate,
                hasVoice: true,
                energyLevel: avgEnergy
            });
        }
    }

    return mergeAdjacentSegments(segments);
}

function mergeAdjacentSegments(segments: AudioSample[]): AudioSample[] {
    if (segments.length === 0) return [];

    const merged: AudioSample[] = [];
    let current = segments[0];

    for (let i = 1; i < segments.length; i++) {
        const next = segments[i];
        // If adjacent (within 0.1s), merge
        if (next.startTime - current.endTime < 0.1) {
            current.endTime = next.endTime;
            current.duration += next.duration;
            current.energyLevel = (current.energyLevel + next.energyLevel) / 2;
        } else {
            merged.push(current);
            current = next;
        }
    }
    merged.push(current);
    return merged;
}

function selectRepresentativeSamples(
    segments: AudioSample[],
    totalDuration: number,
    count: number // Kept for signature compatibility, but logic is now specific
): AudioSample[] {
    const selected: AudioSample[] = [];

    // Short video handling (<=150s): avoid zone overlap issues (fixes C2)
    if (totalDuration <= 150) {
        logger.info(`Short video detected (${totalDuration}s), using simplified sampling`);
        // For short videos, return all valid speech segments (max 5 minutes)
        const validSegments = segments.filter(s => s.duration >= 5);

        let accumulated = 0;
        const targetDuration = 300; // Max 5 minutes

        for (const seg of validSegments) {
            if (accumulated >= targetDuration) break;
            selected.push(seg);
            accumulated += seg.duration;
        }

        logger.info(`Selected ${selected.length} segments, total ${accumulated.toFixed(1)}s`);
        return selected.sort((a, b) => a.startTime - b.startTime);
    }

    // For longer videos (>150s), use original three-zone strategy
    // Strategy:
    // 1. Start: 0-120s (Continuous 2 mins)
    // 2. Middle: 4 x 30s segments distributed in middle 60%
    // 3. End: 2 x 30s segments distributed in last 20%

    // Helper to find best segment in a range
    const findBestSegmentInRange = (start: number, end: number, minDuration: number = 5): AudioSample | null => {
        const candidates = segments.filter(s =>
            s.startTime >= start && s.endTime <= end && s.duration >= minDuration
        );
        if (candidates.length === 0) return null;
        // Sort by energy and duration
        return candidates.sort((a, b) => (b.energyLevel * b.duration) - (a.energyLevel * a.duration))[0];
    };

    // 1. Start Zone (0 - 120s)
    // We try to get as much valid speech as possible in the first 2 minutes
    const startZoneEnd = Math.min(totalDuration, 120);
    const startSegments = segments.filter(s => s.endTime <= startZoneEnd);

    // Calculate total duration of valid speech in the start zone
    const validSpeechDuration = startSegments.reduce((sum, s) => sum + s.duration, 0);
    const coverageRatio = validSpeechDuration / startZoneEnd;

    // User Rule: If valid speech covers > 70% of the zone, take the whole zone continuously.
    // This avoids fragmentation when the audio is mostly speech.
    if (coverageRatio > 0.7) {
        selected.push({
            startTime: 0,
            endTime: startZoneEnd,
            duration: startZoneEnd,
            hasVoice: true,
            energyLevel: 1 // Placeholder
        });
    } else {
        // Otherwise, take only the valid VAD segments to avoid silence
        startSegments.forEach(s => selected.push(s));
    }


    // 2. Middle Zone (20% to 80%)
    // We want 4 segments of ~30s each.
    const midStart = totalDuration * 0.2;
    const midEnd = totalDuration * 0.8;
    const midDuration = midEnd - midStart;

    if (midDuration > 30) {
        const step = midDuration / 4;
        for (let i = 0; i < 4; i++) {
            const zoneStart = midStart + (i * step);
            const zoneEnd = zoneStart + step;
            // Look for a good 30s chunk (or max available) in this zone
            // We'll pick the highest energy segment
            const best = findBestSegmentInRange(zoneStart, zoneEnd);
            if (best) selected.push(best);
        }
    }

    // 3. End Zone (Last 20%)
    // We want 2 segments of ~30s each.
    const endStart = totalDuration * 0.8;
    const endDuration = totalDuration - endStart;

    if (endDuration > 30) {
        const step = endDuration / 2;
        for (let i = 0; i < 2; i++) {
            const zoneStart = endStart + (i * step);
            const zoneEnd = zoneStart + step;
            const best = findBestSegmentInRange(zoneStart, zoneEnd);
            if (best) selected.push(best);
        }
    }

    // Deduplicate and sort
    const uniqueSelected = selected.reduce((acc, current) => {
        const isDuplicate = acc.some(s =>
            s.startTime === current.startTime && s.endTime === current.endTime
        );
        if (!isDuplicate) acc.push(current);
        return acc;
    }, [] as AudioSample[]);

    return uniqueSelected.sort((a, b) => a.startTime - b.startTime);
}
