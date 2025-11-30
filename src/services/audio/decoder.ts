import { logger } from '@/services/utils/logger';

/**
 * Decode audio file to AudioBuffer
 */
export const decodeAudio = async (file: File): Promise<AudioBuffer> => {
    const arrayBuffer = await file.arrayBuffer();
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) throw new Error("Web Audio API not supported");
    const ctx = new AudioContext();
    return await ctx.decodeAudioData(arrayBuffer);
};

/**
 * Decode audio with automatic retry on failure
 */
export async function decodeAudioWithRetry(file: File, retries = 3): Promise<AudioBuffer> {
    for (let i = 0; i < retries; i++) {
        try {
            return await decodeAudio(file);
        } catch (e: any) {
            if (i < retries - 1) {
                logger.warn(`Audio decoding failed. Retrying...`, { attempt: i + 1, error: e.message });
                await new Promise(r => setTimeout(r, 1000));
            } else {
                throw e;
            }
        }
    }
    throw new Error("Audio decoding failed after retries.");
}
