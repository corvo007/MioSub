import { AppSettings } from './settings';
import { WorkspaceHistory } from './history';
import { SubtitleSnapshot } from './subtitle';

export interface AudioExtractionOptions {
  format?: 'wav' | 'mp3' | 'flac';
  sampleRate?: number;
  channels?: number;
  bitrate?: string;
  customFfmpegPath?: string;
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
  isElectron: boolean;
  isDebug: boolean;
  // 现有方法
  getFilePath: (file: File) => string;
  selectMediaFile: () => Promise<{
    success: boolean;
    filePath?: string;
    fileName?: string;
    size?: number;
    type?: string;
    canceled?: boolean;
    error?: string;
  }>;
  readAudioFile: (filePath: string) => Promise<ArrayBuffer>;
  readLocalFile: (filePath: string) => Promise<ArrayBuffer>;
  saveSubtitleDialog: (
    defaultName: string,
    content: string,
    format: string
  ) => Promise<{
    success: boolean;
    path?: string;
  }>;
  saveLogsDialog: (content: string) => Promise<{
    success: boolean;
    filePath?: string;
    error?: string;
    canceled?: boolean;
  }>;
  selectWhisperModel: () => Promise<{
    success: boolean;
    path?: string;
    error?: string;
    canceled?: boolean;
  }>;
  transcribeLocal: (data: {
    audioData: ArrayBuffer;
    modelPath: string;
    language?: string;
    threads?: number;
    customBinaryPath?: string;
  }) => Promise<{
    success: boolean;
    segments?: { start: string; end: string; text: string }[];
    error?: string;
  }>;
  abortLocalWhisper: () => Promise<void>;

  // FFmpeg 新增方法
  extractAudioFFmpeg: (
    videoPath: string,
    options?: AudioExtractionOptions
  ) => Promise<{
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
  onAudioExtractionProgress: (callback: (progress: AudioExtractionProgress) => void) => () => void;
  onNewLog: (callback: (log: string) => void) => () => void;

  // Storage
  storage: {
    getSettings: () => Promise<Partial<AppSettings>>;
    setSettings: (settings: Partial<AppSettings>) => Promise<void>;
  };

  // Open external link
  openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;

  // Video Download APIs
  download: {
    parse: (url: string) => Promise<{
      success: boolean;
      videoInfo?: {
        id: string;
        title: string;
        thumbnail: string;
        duration: number;
        uploader: string;
        platform: 'youtube' | 'bilibili';
        formats: {
          formatId: string;
          quality: string;
          ext: string;
          filesize?: number;
          hasAudio: boolean;
          hasVideo: boolean;
        }[];
      };
      error?: string;
      errorInfo?: {
        type: string;
        message: string;
        originalError: string;
        retryable: boolean;
      };
    }>;
    start: (options: { url: string; formatId: string; outputDir: string }) => Promise<{
      success: boolean;
      outputPath?: string;
      error?: string;
      errorInfo?: {
        type: string;
        message: string;
        originalError: string;
        retryable: boolean;
      };
    }>;
    cancel: () => Promise<{ success: boolean }>;
    selectDir: () => Promise<{ success: boolean; path?: string; canceled?: boolean }>;
    getDefaultDir: () => Promise<{ success: boolean; path: string }>;
    onProgress: (
      callback: (progress: {
        percent: number;
        speed: string;
        eta: string;
        downloaded: number;
        total: number;
      }) => void
    ) => () => void;
  };

  // Utils
  writeTempFile: (
    content: string,
    extension: string
  ) => Promise<{ success: boolean; path?: string; error?: string }>;
  showItemInFolder: (path: string) => Promise<boolean>;

  // Video Compression APIs
  compression: {
    compress: (inputPath: string, outputPath: string, options: any) => Promise<string>;
    cancel: () => Promise<{ success: boolean }>;
    getInfo: (filePath: string) => Promise<any>;
    onProgress: (callback: (progress: any) => void) => () => void;
  };

  // History APIs
  history: {
    get: () => Promise<WorkspaceHistory[]>;
    save: (histories: WorkspaceHistory[]) => Promise<boolean>;
    delete: (id: string) => Promise<boolean>;
  };

  // Snapshots APIs
  snapshots: {
    get: () => Promise<SubtitleSnapshot[]>;
    save: (snapshots: SubtitleSnapshot[]) => Promise<boolean>;
  };

  getMainLogs: () => Promise<string[]>;

  // Events
  onShowAbout: (callback: () => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
