export enum GenerationStatus {
    IDLE = 'idle',
    UPLOADING = 'uploading',
    PROCESSING = 'processing',
    PROOFREADING = 'proofreading',
    COMPLETED = 'completed',
    ERROR = 'error',
    CANCELLED = 'cancelled',
}

export interface ChunkStatus {
    id: number | string;
    total: number;
    status: 'pending' | 'processing' | 'completed' | 'error';
    stage?: 'transcribing' | 'waiting_glossary' | 'waiting_speakers' | 'refining' | 'translating';
    message?: string;
    toast?: {
        message: string;
        type: 'info' | 'warning' | 'error' | 'success';
    };
}

export interface TokenUsage {
    promptTokens: number;
    candidatesTokens: number;
    totalTokens: number;
    modelName: string;
}
