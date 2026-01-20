// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

import { contextBridge, ipcRenderer, webUtils, webFrame } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // ... existing fields
  isElectron: true,
  isDebug: process.env.DEBUG_BUILD === 'true' || process.env.NODE_ENV === 'development',
  setZoomFactor: (factor: number) => webFrame.setZoomFactor(factor),
  getZoomFactor: () => webFrame.getZoomFactor(),
  getFilePath: (file: File) => webUtils.getPathForFile(file),
  // ... rest of API

  selectMediaFile: () => ipcRenderer.invoke('select-media-file'),
  selectSubtitleFile: () => ipcRenderer.invoke('select-subtitle-file'),
  selectJsonFile: () => ipcRenderer.invoke('select-json-file'),
  readAudioFile: (filePath: string) => ipcRenderer.invoke('read-audio-file', filePath),
  readLocalFile: (filePath: string) => ipcRenderer.invoke('read-local-file', filePath),
  saveSubtitleDialog: (defaultName: string, content: string, format: 'srt' | 'ass') =>
    ipcRenderer.invoke('save-subtitle-dialog', defaultName, content, format),
  saveLogsDialog: (content: string) => ipcRenderer.invoke('save-logs-dialog', content),
  saveDebugArtifact: (name: string, content: string) =>
    ipcRenderer.invoke('debug:save-artifact', name, content),

  // New: Local Whisper APIs
  selectWhisperModel: () => ipcRenderer.invoke('select-whisper-model'),
  selectAlignerExecutable: () => ipcRenderer.invoke('select-aligner-executable'),
  selectAlignerModelDir: () => ipcRenderer.invoke('select-aligner-model-dir'),
  transcribeLocal: (data: {
    audioData: ArrayBuffer;
    modelPath: string;
    language?: string;
    threads?: number;
  }) => ipcRenderer.invoke('transcribe-local', data),
  abortLocalWhisper: () => ipcRenderer.invoke('local-whisper-abort'),

  // FFmpeg APIs
  extractAudioFFmpeg: (videoPath: string, options?: any) =>
    ipcRenderer.invoke('extract-audio-ffmpeg', videoPath, options),
  readExtractedAudio: (audioPath: string) => ipcRenderer.invoke('read-extracted-audio', audioPath),
  cleanupTempAudio: (audioPath: string) => ipcRenderer.invoke('cleanup-temp-audio', audioPath),
  getAudioInfo: (videoPath: string) => ipcRenderer.invoke('get-audio-info', videoPath),
  onAudioExtractionProgress: (callback: (progress: any) => void) => {
    const subscription = (_event: any, progress: any) => callback(progress);
    ipcRenderer.on('audio-extraction-progress', subscription);
    return () => {
      ipcRenderer.removeListener('audio-extraction-progress', subscription);
    };
  },
  onNewLog: (callback: (log: string) => void) => {
    const subscription = (_event: any, log: string) => callback(log);
    ipcRenderer.on('new-log', subscription);
    return () => {
      ipcRenderer.removeListener('new-log', subscription);
    };
  },

  // Storage
  storage: {
    getSettings: () => ipcRenderer.invoke('storage-get'),
    setSettings: (settings: any) => ipcRenderer.invoke('storage-set', settings),
  },

  // i18n - sync language to main process
  i18n: {
    changeLanguage: (lang: string) => ipcRenderer.invoke('i18n:change-language', lang),
  },

  // CTC Alignment APIs
  alignment: {
    ctc: (data: any) => ipcRenderer.invoke('alignment:ctc', data),
    ctcAbort: () => ipcRenderer.invoke('alignment:ctc-abort'),
  },

  // Open external link
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),

  // Video Download APIs
  download: {
    parse: (url: string) => ipcRenderer.invoke('download:parse', url),
    start: (options: { url: string; formatId: string; outputDir: string }) =>
      ipcRenderer.invoke('download:start', options),
    cancel: () => ipcRenderer.invoke('download:cancel'),
    selectDir: () => ipcRenderer.invoke('download:select-dir'),
    getDefaultDir: () => ipcRenderer.invoke('download:default-dir'),
    downloadThumbnail: (options: {
      thumbnailUrl: string;
      outputDir: string;
      videoTitle: string;
      videoId: string;
    }) => ipcRenderer.invoke('download:thumbnail', options),
    onProgress: (callback: (progress: any) => void) => {
      const subscription = (_event: any, progress: any) => callback(progress);
      ipcRenderer.on('download:progress', subscription);
      return () => {
        ipcRenderer.removeListener('download:progress', subscription);
      };
    },
  },

  // Utils
  writeTempFile: (content: string, extension: string) =>
    ipcRenderer.invoke('util:write-temp', content, extension),
  writeTempAudioFile: (audioData: string | ArrayBuffer, extension: string) =>
    ipcRenderer.invoke('util:write-temp-audio', audioData, extension),
  getResourcePath: (resourceName: string) =>
    ipcRenderer.invoke('util:get-resource-path', resourceName),
  showItemInFolder: (path: string) => ipcRenderer.invoke('shell:show-item-in-folder', path),
  getAboutInfo: (lastHash?: string) => ipcRenderer.invoke('util:get-about-info', lastHash),

  // Video Compression APIs
  compression: {
    compress: (inputPath: string, outputPath: string, options: any) =>
      ipcRenderer.invoke('video:compress', inputPath, outputPath, options),
    cancel: () => ipcRenderer.invoke('video:cancel'),
    getInfo: (filePath: string) => ipcRenderer.invoke('video:get-info', filePath),
    getHwAccelInfo: () => ipcRenderer.invoke('video:hw-accel-info'),
    onProgress: (callback: (progress: any) => void) => {
      const subscription = (_event: any, progress: any) => callback(progress);
      ipcRenderer.on('video:compression-progress', subscription);
      return () => {
        ipcRenderer.removeListener('video:compression-progress', subscription);
      };
    },
  },

  // Video Preview Transcoding APIs (for streaming playback during transcode)
  transcodeForPreview: (options: { filePath: string }) =>
    ipcRenderer.invoke('video-preview:transcode', options),
  needsTranscode: (filePath: string) =>
    ipcRenderer.invoke('video-preview:needs-transcode', filePath),
  onTranscodeProgress: (
    callback: (data: { percent: number; transcodedDuration?: number }) => void
  ) => {
    const subscription = (_event: any, data: any) => callback(data);
    ipcRenderer.on('video-preview:transcode-progress', subscription);
    return () => {
      ipcRenderer.removeListener('video-preview:transcode-progress', subscription);
    };
  },
  onTranscodeStart: (callback: (data: { outputPath: string }) => void) => {
    const subscription = (_event: any, data: any) => callback(data);
    ipcRenderer.on('video-preview:transcode-start', subscription);
    return () => {
      ipcRenderer.removeListener('video-preview:transcode-start', subscription);
    };
  },

  // Video Preview Cache APIs
  cache: {
    getSize: () =>
      ipcRenderer.invoke('cache:get-size') as Promise<{ size: number; fileCount: number }>,
    clear: () =>
      ipcRenderer.invoke('cache:clear') as Promise<{ cleared: number; freedBytes: number }>,
  },

  // History APIs
  history: {
    get: () => ipcRenderer.invoke('history-get'),
    save: (histories: any[]) => ipcRenderer.invoke('history-save', histories),
    delete: (id: string) => ipcRenderer.invoke('history-delete', id),
  },

  // Snapshots APIs
  snapshots: {
    get: () => ipcRenderer.invoke('snapshots-get'),
    save: (snapshots: any[]) => ipcRenderer.invoke('snapshots-save', snapshots),
  },

  // Logs APIs
  getMainLogs: () => ipcRenderer.invoke('log:get-history'),
  sendLog: (entry: { level: string; message: string; data?: any }) =>
    ipcRenderer.send('log:from-renderer', entry),

  // Analytics
  analytics: {
    track: (signal: string, payload?: any, eventType?: 'page_view' | 'interaction' | 'system') =>
      ipcRenderer.invoke('analytics:track', signal, payload, eventType),
  },

  // End-to-End Pipeline APIs
  endToEnd: {
    start: (config: any) => ipcRenderer.invoke('end-to-end:start', config),
    abort: () => ipcRenderer.invoke('end-to-end:abort'),
    getStatus: () => ipcRenderer.invoke('end-to-end:status'),
    onProgress: (callback: (progress: any) => void) => {
      const subscription = (_event: any, progress: any) => callback(progress);
      ipcRenderer.on('end-to-end:progress', subscription);
      return () => {
        ipcRenderer.removeListener('end-to-end:progress', subscription);
      };
    },
    // Listen for subtitle generation request from main process
    onGenerateSubtitles: (
      callback: (data: { config: any; videoPath: string; audioPath: string }) => void
    ) => {
      const subscription = (_event: any, data: any) => callback(data);
      ipcRenderer.on('end-to-end:generate-subtitles', subscription);
      return () => {
        ipcRenderer.removeListener('end-to-end:generate-subtitles', subscription);
      };
    },
    // Send subtitle generation result back to main process
    sendSubtitleResult: (result: {
      success: boolean;
      subtitles?: any[];
      subtitlePath?: string;
      error?: string;
    }) => {
      ipcRenderer.send('end-to-end:subtitle-complete', result);
    },
    // Send subtitle generation progress to main process
    sendSubtitleProgress: (progress: any) => {
      ipcRenderer.send('end-to-end:subtitle-progress', progress);
    },
    // Listen for abort signal from main process
    onAbortSubtitleGeneration: (callback: () => void) => {
      const subscription = () => callback();
      ipcRenderer.on('end-to-end:abort-subtitle-generation', subscription);
      return () => {
        ipcRenderer.removeListener('end-to-end:abort-subtitle-generation', subscription);
      };
    },
  },
});
