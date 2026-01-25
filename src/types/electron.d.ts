import { type AppSettings } from '@/types/settings';
import { type WorkspaceHistory } from '@/types/history';
import { type SubtitleSnapshot } from '@/types/subtitle';

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
  setZoomFactor: (factor: number) => void;
  getZoomFactor: () => number;
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
  selectSubtitleFile: () => Promise<{
    success: boolean;
    filePath?: string;
    fileName?: string;
    content?: string;
    canceled?: boolean;
    error?: string;
  }>;
  selectJsonFile: () => Promise<{
    success: boolean;
    filePath?: string;
    fileName?: string;
    content?: string;
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
  saveDebugArtifact: (name: string, content: string) => Promise<boolean>;
  selectWhisperModel: () => Promise<{
    success: boolean;
    path?: string;
    error?: string;
    canceled?: boolean;
  }>;
  selectWhisperBinary: () => Promise<{
    success: boolean;
    path?: string;
    error?: string;
    canceled?: boolean;
  }>;
  selectAlignerExecutable: () => Promise<{
    success: boolean;
    path?: string;
    error?: string;
    canceled?: boolean;
  }>;
  selectAlignerModelDir: () => Promise<{
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
  onNewLog: (callback: (log: any) => void) => () => void;

  // Storage
  storage: {
    getSettings: () => Promise<Partial<AppSettings>>;
    setSettings: (settings: Partial<AppSettings>) => Promise<void>;
  };

  // Video Preview Cache
  cache: {
    getSize: () => Promise<{ size: number; fileCount: number }>;
    clear: () => Promise<{ cleared: number; freedBytes: number }>;
  };

  // CTC Alignment APIs
  alignment: {
    ctc: (data: {
      segments: { index: number; text: string; start?: number; end?: number }[];
      audioPath: string;
      language: string;
      config: {
        alignerPath: string;
        modelPath: string;
        batchSize?: number;
        romanize?: boolean;
      };
    }) => Promise<{
      success: boolean;
      segments?: { index: number; start: number; end: number; text: string; score: number }[];
      metadata?: { count: number; processing_time: number };
      error?: string;
    }>;
    ctcAbort: () => Promise<{ success: boolean }>;
  };

  // Tokenizer API
  tokenizer: {
    tokenize: (text: string) => Promise<{ success: boolean; tokens?: any[]; error?: string }>;
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
    cancelParse: (url: string) => Promise<{ success: boolean }>;
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
    downloadThumbnail: (options: {
      thumbnailUrl: string;
      outputDir: string;
      videoTitle: string;
      videoId: string;
    }) => Promise<{
      success: boolean;
      thumbnailPath?: string;
      error?: string;
    }>;
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
  writeTempAudioFile: (
    audioData: string | ArrayBuffer,
    extension: string
  ) => Promise<{ success: boolean; path?: string; error?: string }>;
  getResourcePath: (
    resourceName: string
  ) => Promise<{ success: boolean; path?: string; error?: string }>;
  showItemInFolder: (path: string) => Promise<{ success: boolean; error?: string }>;
  getAboutInfo: (lastHash?: string) => Promise<{
    notModified?: boolean;
    hash?: string;
    appName?: string;
    version?: string;
    isPackaged?: boolean;
    commitHash?: string;
    versions?: {
      ffmpeg: string;
      ffprobe: string;
      ytdlp: string;
      qjs: string;
      whisper: string;
      whisperDetails: {
        path: string;
        source: string;
        version: string;
        gpuSupport: boolean;
      };
    };
    gpu?: {
      available: boolean;
      preferredH264?: string;
      preferredH265?: string;
    };
    paths?: {
      appPath: string;
      userDataPath: string;
      exePath: string;
    };
  }>;

  // Video Compression APIs
  compression: {
    compress: (inputPath: string, outputPath: string, options: any) => Promise<string>;
    cancel: () => Promise<{ success: boolean }>;
    getInfo: (filePath: string) => Promise<any>;
    getHwAccelInfo: () => Promise<{
      available: boolean;
      encoders: {
        h264_nvenc: boolean;
        hevc_nvenc: boolean;
        h264_qsv: boolean;
        hevc_qsv: boolean;
        h264_amf: boolean;
        hevc_amf: boolean;
      };
      preferredH264: string;
      preferredH265: string;
    }>;
    onProgress: (callback: (progress: any) => void) => () => void;
  };

  // Video Preview Transcoding APIs (for streaming playback during transcode)
  transcodeForPreview: (options: { filePath: string }) => Promise<{
    success: boolean;
    outputPath?: string;
    duration?: number;
    error?: string;
  }>;
  cancelPreviewTranscode: (filePath: string) => Promise<{ success: boolean }>;
  needsTranscode: (filePath: string) => Promise<boolean>;
  onTranscodeProgress: (
    callback: (data: { percent: number; transcodedDuration?: number }) => void
  ) => () => void;
  onTranscodeStart: (callback: (data: { outputPath: string }) => void) => () => void;

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

  getMainLogs: () => Promise<any[]>;
  sendLog: (entry: { level: string; message: string; data?: any }) => void;
  // Analytics
  analytics: {
    track: (
      signal: string,
      payload?: any,
      eventType?: 'page_view' | 'interaction' | 'system'
    ) => Promise<{ success: boolean }>;
  };

  // Update APIs
  update: {
    check: () => Promise<{
      success: boolean;
      hasUpdate?: boolean;
      version?: string;
      downloadUrl?: string;
      error?: string;
    }>;
    download: () => Promise<{ success: boolean; error?: string }>;
    install: () => Promise<{ success: boolean; error?: string }>;
    getStatus: () => Promise<{
      status:
        | 'idle'
        | 'checking'
        | 'available'
        | 'not-available'
        | 'downloading'
        | 'downloaded'
        | 'error';
      version: string | null;
      error: string | null;
      progress: number;
      isPortable: boolean;
    }>;
    onStatus: (
      callback: (status: {
        status:
          | 'idle'
          | 'checking'
          | 'available'
          | 'not-available'
          | 'downloading'
          | 'downloaded'
          | 'error';
        version: string | null;
        error: string | null;
        progress: number;
        isPortable: boolean;
      }) => void
    ) => () => void;
  };

  // End-to-End Pipeline APIs
  endToEnd: {
    start: (config: any) => Promise<{
      success: boolean;
      finalStage: string;
      outputs: {
        videoPath?: string;
        audioPath?: string;
        thumbnailPath?: string;
        subtitles?: any[];
        subtitlePath?: string;
        outputVideoPath?: string;
      };
      duration: number;
      error?: string;
      errorDetails?: {
        stage: string;
        message: string;
        originalError?: string;
        retryable?: boolean;
      };
    }>;
    abort: () => Promise<{ success: boolean }>;
    getStatus: () => Promise<{
      stage: string;
      outputs: any;
      isRunning: boolean;
    }>;
    onProgress: (
      callback: (progress: {
        stage: string;
        stageProgress: number;
        overallProgress: number;
        message: string;
        videoInfo?: any;
        downloadProgress?: any;
        transcribeProgress?: any;
        compressProgress?: any;
        finalStage?: string;
      }) => void
    ) => () => void;
    onGenerateSubtitles: (
      callback: (data: { config: any; videoPath: string; audioPath: string }) => void
    ) => () => void;
    sendSubtitleResult: (result: {
      success: boolean;
      subtitles?: any[];
      subtitlePath?: string;
      subtitleContent?: string;
      subtitleFormat?: string;
      error?: string;
    }) => void;
    sendSubtitleProgress: (progress: any) => void;
    onAbortSubtitleGeneration: (callback: () => void) => () => void;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
