import { GoogleGenAI } from "@google/genai";
import { blobToBase64 } from "@/services/audio/converter";
import { logger } from "@/services/utils/logger";
import { TokenUsage } from "@/types/api";
import { SPEAKER_PROFILE_SCHEMA } from "./schemas";
import { getSpeakerProfileExtractionPrompt } from "./prompts";
import { generateContentWithRetry, formatGeminiError } from "./client";

export interface SpeakerProfile {
    id: string;
    characteristics: {
        gender: 'male' | 'female' | 'unknown';
        name?: string;
        pitch: 'low' | 'medium' | 'high';
        speed: 'slow' | 'normal' | 'fast';
        accent: string;
        tone: string;
    };
    inferredIdentity?: string;
    speakingStyle?: {
        formality?: 'formal' | 'casual' | 'mixed';
        vocabulary?: string; // e.g., "technical", "colloquial", "poetic"
        sentenceStructure?: string; // e.g., "complex", "simple", "fragmented"
    };
    emotionalTone?: string; // e.g., "enthusiastic", "calm", "nervous", "authoritative"
    catchphrases?: string[]; // Repeated phrases or verbal tics
    speakingContext?: string[]; // Topics or scenarios where this speaker appears
    sampleQuotes: string[];
    confidence: number;
}

export interface SpeakerProfileSet {
    profiles: SpeakerProfile[];
    extractedAt: Date;
    audioDuration: number;
    modelVersion: string;
}

/**
 * Extracts speaker profiles from audio using Gemini 3.0 Pro.
 * 
 * @param ai GoogleGenAI instance
 * @param audioBlob Sampled audio blob
 * @param audioDuration Exact duration of the audio blob in seconds
 * @param genre Content genre/context
 * @param timeoutMs Timeout in milliseconds
 * @param onUsage Callback for token usage tracking
 * @param signal AbortSignal for cancellation
 */
export async function extractSpeakerProfiles(
    ai: GoogleGenAI,
    audioBlob: Blob,
    audioDuration: number,
    genre: string,
    timeoutMs: number = 300000,
    onUsage?: (usage: TokenUsage) => void,
    signal?: AbortSignal
): Promise<SpeakerProfileSet> {
    const base64Audio = await blobToBase64(audioBlob);
    const prompt = getSpeakerProfileExtractionPrompt(genre);

    logger.debug("Speaker Profile Request:", { promptLength: prompt.length, audioSize: base64Audio.length });

    try {
        const response = await generateContentWithRetry(
            ai,
            {
                model: 'gemini-3-pro-preview',
                contents: {
                    parts: [
                        { text: prompt },
                        {
                            inlineData: {
                                mimeType: "audio/wav",
                                data: base64Audio
                            }
                        }
                    ]
                },
                config: {
                    responseMimeType: "application/json",
                    responseSchema: SPEAKER_PROFILE_SCHEMA,
                    maxOutputTokens: 8192,
                    tools: [{ googleSearch: {} }], // Enable Search Grounding
                    thinkingConfig: {
                        thinkingLevel: "high" as any
                    }
                }
            },
            3, // retries
            signal,
            onUsage,
            timeoutMs // Pass timeout to the API call
        );

        const text = response.text || "{}";
        logger.debug("Speaker Profile Response:", text);

        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            logger.error("Failed to parse speaker profile JSON", e);
            data = { profiles: [] };
        }

        return {
            profiles: data.profiles || [],
            extractedAt: new Date(),
            audioDuration: audioDuration,
            modelVersion: "gemini-3-pro-preview"
        };

    } catch (error) {
        logger.error("Speaker profile extraction failed", formatGeminiError(error));
        throw error; // Rethrow to allow caller to handle retry logic
    }
}
