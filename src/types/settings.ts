import { GlossaryItem, Glossary } from './glossary';

export const GENRE_PRESETS = ['general', 'anime', 'movie', 'news', 'tech'];
export type Genre = 'general' | 'anime' | 'movie' | 'news' | 'tech';

export interface DebugSettings {
    mockGemini: boolean;
    mockOpenAI: boolean;
    mockLocalWhisper: boolean;
    ffmpegPath?: string;
    ffprobePath?: string;
    whisperPath?: string;
}

export interface AppSettings {
    debug?: DebugSettings;
    geminiKey: string;
    openaiKey: string;
    openaiEndpoint?: string;
    geminiEndpoint?: string;
    transcriptionModel: string; // 'whisper-1' | 'gpt-4o-audio-preview'
    genre: string; // Changed from Genre to string to support custom input
    customTranslationPrompt: string;
    customProofreadingPrompt: string;
    outputMode: 'bilingual' | 'target_only';
    proofreadBatchSize: number;
    translationBatchSize: number;
    chunkDuration: number;
    concurrencyFlash: number;
    concurrencyPro: number;

    useSmartSplit?: boolean;
    glossary?: GlossaryItem[]; // Deprecated, used for migration
    glossaries?: Glossary[];
    activeGlossaryId?: string;
    // Glossary Extraction Settings
    enableAutoGlossary?: boolean;           // Default: true
    glossarySampleMinutes?: number | 'all'; // Default: 'all', or max minutes to analyze
    glossaryAutoConfirm?: boolean;          // Default: false (show dialog)
    requestTimeout?: number;                // Default: 600 (seconds)

    // Local Whisper Settings
    useLocalWhisper?: boolean;      // Whether to use local Whisper
    whisperModelPath?: string;      // Model file path (.bin)
    whisperThreads?: number;        // Number of threads (default: 4)
    whisperConcurrency?: number;    // Max concurrent processes (default: 1)

    // Speaker Diarization Settings
    enableDiarization?: boolean;        // Enable speaker identification (default: false)
    includeSpeakerInExport?: boolean;   // Include speaker names in exported subtitles (default: false)
    useSpeakerColors?: boolean;         // Apply different colors for each speaker in ASS export (default: false)
}
