// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

import { contextBridge, ipcRenderer, webUtils } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  isDebug: process.env.DEBUG_BUILD === 'true' || process.env.NODE_ENV === 'development',
  getFilePath: (file: File) => webUtils.getPathForFile(file),
  selectMediaFile: () => ipcRenderer.invoke('select-media-file'),
  selectSubtitleFile: () => ipcRenderer.invoke('select-subtitle-file'),
  selectJsonFile: () => ipcRenderer.invoke('select-json-file'),
  readAudioFile: (filePath: string) => ipcRenderer.invoke('read-audio-file', filePath),
  readLocalFile: (filePath: string) => ipcRenderer.invoke('read-local-file', filePath),
  saveSubtitleDialog: (defaultName: string, content: string, format: 'srt' | 'ass') =>
    ipcRenderer.invoke('save-subtitle-dialog', defaultName, content, format),
  saveLogsDialog: (content: string) => ipcRenderer.invoke('save-logs-dialog', content),

  // New: Local Whisper APIs
  selectWhisperModel: () => ipcRenderer.invoke('select-whisper-model'),
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
  showItemInFolder: (path: string) => ipcRenderer.invoke('shell:show-item-in-folder', path),

  // Video Compression APIs
  compression: {
    compress: (inputPath: string, outputPath: string, options: any) =>
      ipcRenderer.invoke('video:compress', inputPath, outputPath, options),
    cancel: () => ipcRenderer.invoke('video:cancel'),
    getInfo: (filePath: string) => ipcRenderer.invoke('video:get-info', filePath),
    onProgress: (callback: (progress: any) => void) => {
      const subscription = (_event: any, progress: any) => callback(progress);
      ipcRenderer.on('video:compression-progress', subscription);
      return () => {
        ipcRenderer.removeListener('video:compression-progress', subscription);
      };
    },
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
  onShowAbout: (callback: () => void) => {
    const subscription = () => callback();
    ipcRenderer.on('show-about', subscription);
    return () => {
      ipcRenderer.removeListener('show-about', subscription);
    };
  },
});
