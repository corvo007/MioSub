export interface AudioExtractionOptions {
    format?: 'wav' | 'mp3' | 'flac';
    sampleRate?: number;
    channels?: number;
    bitrate?: string;
}

export interface AudioExtractionProgress {
    percent: number;
    currentTime: string;
    targetSize: string;
}

export interface AudioInfo {
    duration: number;
    codec: string;
    sampleRate: number;
    channels: number;
}

export interface ElectronAPI {
    // 现有方法
    getFilePath: (file: File) => string;
    readAudioFile: (filePath: string) => Promise<ArrayBuffer>;
    saveSubtitleDialog: (defaultName: string, content: string, format: string) => Promise<{
        success: boolean;
        path?: string;
    }>;
    selectWhisperModel: () => Promise<string | null>;
    transcribeLocal: (data: { audioData: ArrayBuffer, modelPath: string, language?: string, threads?: number }) => Promise<{
        success: boolean;
        segments?: { start: string; end: string; text: string }[];
        error?: string;
    }>;

    // FFmpeg 新增方法
    extractAudioFFmpeg: (videoPath: string, options?: AudioExtractionOptions) => Promise<{
        success: boolean;
        audioPath?: string;
        error?: string;
    }>;
    readExtractedAudio: (audioPath: string) => Promise<ArrayBuffer>;
    cleanupTempAudio: (audioPath: string) => Promise<void>;
    getAudioInfo: (videoPath: string) => Promise<{
        success: boolean;
        info?: AudioInfo;
        error?: string;
    }>;
    onAudioExtractionProgress: (callback: (progress: AudioExtractionProgress) => void) => void;
    onNewLog: (callback: (log: string) => void) => () => void;

    // Storage
    storage: {
        getSettings: () => Promise<any>;
        setSettings: (settings: any) => Promise<void>;
    };
}

declare global {
    interface Window {
        electronAPI: ElectronAPI;
    }
}
