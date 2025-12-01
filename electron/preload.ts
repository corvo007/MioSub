// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

import { contextBridge, ipcRenderer, webUtils } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
    isElectron: true,
    getFilePath: (file: File) => webUtils.getPathForFile(file),
    readAudioFile: (filePath: string) => ipcRenderer.invoke('read-audio-file', filePath),
    saveSubtitleDialog: (defaultName: string, content: string, format: 'srt' | 'ass') =>
        ipcRenderer.invoke('save-subtitle-dialog', defaultName, content, format),
    saveLogsDialog: (content: string) =>
        ipcRenderer.invoke('save-logs-dialog', content),

    // New: Local Whisper APIs
    selectWhisperModel: () => ipcRenderer.invoke('select-whisper-model'),
    transcribeLocal: (data: { audioData: ArrayBuffer, modelPath: string, language?: string, threads?: number }) =>
        ipcRenderer.invoke('transcribe-local', data),

    // FFmpeg APIs
    extractAudioFFmpeg: (videoPath: string, options?: any) =>
        ipcRenderer.invoke('extract-audio-ffmpeg', videoPath, options),
    readExtractedAudio: (audioPath: string) =>
        ipcRenderer.invoke('read-extracted-audio', audioPath),
    cleanupTempAudio: (audioPath: string) =>
        ipcRenderer.invoke('cleanup-temp-audio', audioPath),
    getAudioInfo: (videoPath: string) =>
        ipcRenderer.invoke('get-audio-info', videoPath),
    onAudioExtractionProgress: (callback: (progress: any) => void) => {
        ipcRenderer.on('audio-extraction-progress', (_event, progress) => callback(progress));
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
        setSettings: (settings: any) => ipcRenderer.invoke('storage-set', settings)
    }
});
