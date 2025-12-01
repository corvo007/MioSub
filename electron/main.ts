import { app, BrowserWindow, dialog, ipcMain, Menu } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import squirrelStartup from 'electron-squirrel-startup';
import fs from 'fs';
import {
    extractAudioFromVideo,
    readAudioBuffer,
    cleanupTempAudio,
    getAudioInfo
} from './services/ffmpegAudioExtractor.ts';
import type {
    AudioExtractionOptions,
    AudioExtractionProgress
} from './services/ffmpegAudioExtractor.ts';
import { spawn, ChildProcess } from 'child_process';
import { storageService } from './services/storage.ts';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (squirrelStartup) {
    app.quit();
}

import { localWhisperService } from './services/localWhisper.ts';

// IPC Handler: Transcribe Local
ipcMain.handle('transcribe-local', async (_event, { audioData, modelPath, language, threads }: { audioData: ArrayBuffer, modelPath: string, language?: string, threads?: number }) => {
    try {
        console.log(`[Main] Received local transcription request. Model: ${modelPath}, Lang: ${language}, Threads: ${threads}`);
        const result = await localWhisperService.transcribe(audioData, modelPath, language, threads, (msg) => addLog(msg));
        return { success: true, segments: result };
    } catch (error: any) {
        console.error('[Main] Local transcription failed:', error);
        return { success: false, error: error.message };
    }
});

// IPC Handler: Select Whisper Model
ipcMain.handle('select-whisper-model', async () => {
    try {
        const result = await dialog.showOpenDialog({
            title: '选择 Whisper 模型文件',
            message: '请选择 GGML 格式的 .bin 模型文件',
            filters: [
                { name: 'Whisper 模型', extensions: ['bin'] },
                { name: '所有文件', extensions: ['*'] }
            ],
            properties: ['openFile']
        });

        if (!result.canceled && result.filePaths.length > 0) {
            const filePath = result.filePaths[0];
            const validation = localWhisperService.validateModel(filePath);

            if (!validation.valid) {
                dialog.showErrorBox('无效的模型文件', validation.error || '未知错误');
                return null;
            }
            return filePath;
        }
        return null;
    } catch (error: any) {
        console.error('[Main] Model selection failed:', error);
        dialog.showErrorBox('模型选择失败', error.message || '未知错误');
        return null;
    }
});

// IPC Handler: Save Logs Dialog
ipcMain.handle('save-logs-dialog', async (_event, content: string) => {
    try {
        const result = await dialog.showSaveDialog({
            title: '导出日志',
            defaultPath: `gemini-subtitle-pro-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`,
            filters: [
                { name: '文本文件', extensions: ['txt'] },
                { name: '所有文件', extensions: ['*'] }
            ]
        });

        if (!result.canceled && result.filePath) {
            await fs.promises.writeFile(result.filePath, content, 'utf-8');
            return { success: true, filePath: result.filePath };
        }
        return { success: false, canceled: true };
    } catch (error: any) {
        console.error('[Main] Save logs failed:', error);
        return { success: false, error: error.message };
    }
});

// IPC Handler: 提取音频（带进度回调）
ipcMain.handle(
    'extract-audio-ffmpeg',
    async (event, videoPath: string, options: AudioExtractionOptions) => {
        try {
            const audioPath = await extractAudioFromVideo(
                videoPath,
                options,
                (progress: AudioExtractionProgress) => {
                    // 向渲染进程发送进度更新
                    event.sender.send('audio-extraction-progress', progress);
                },
                (logMessage: string) => {
                    // Capture FFmpeg logs
                    addLog(`[FFmpeg] ${logMessage}`);
                }
            );
            return { success: true, audioPath };
        } catch (error: any) {
            console.error('FFmpeg audio extraction failed:', error);
            return { success: false, error: error.message };
        }
    }
);

// IPC Handler: 读取提取的音频文件
ipcMain.handle('read-extracted-audio', async (_event, audioPath: string) => {
    try {
        const buffer = await readAudioBuffer(audioPath);
        return buffer.buffer;
    } catch (error: any) {
        console.error('[Main] Failed to read extracted audio:', error);
        return { success: false, error: error.message };
    }
});

// IPC Handler: 清理临时音频文件
ipcMain.handle('cleanup-temp-audio', async (_event, audioPath: string) => {
    try {
        await cleanupTempAudio(audioPath);
        return { success: true };
    } catch (error: any) {
        console.error('[Main] Failed to cleanup temp audio:', error);
        return { success: false, error: error.message };
    }
});

// IPC Handler: Get Audio Info
ipcMain.handle('get-audio-info', async (_event, videoPath: string) => {
    try {
        const info = await getAudioInfo(videoPath);
        return { success: true, info };
    } catch (error: any) {
        console.error('Failed to get audio info:', error);
        return { success: false, error: error.message };
    }
});

// IPC Handler: Storage
ipcMain.handle('storage-get', async () => {
    try {
        return await storageService.readSettings();
    } catch (error: any) {
        console.error('[Main] Failed to read settings:', error);
        return {}; // Return empty object as fallback
    }
});

ipcMain.handle('storage-set', async (_event, data: any) => {
    try {
        return await storageService.saveSettings(data);
    } catch (error: any) {
        console.error('[Main] Failed to save settings:', error);
        throw error; // Let renderer handle this critical failure
    }
});

// Logging
// Override console methods to capture logs
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

function addLog(message: string) {
    const timestamp = new Date().toLocaleTimeString();
    const logLine = `[${timestamp}] ${message}`;
    originalConsoleLog(logLine); // Use original console log to avoid recursion
    BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send('new-log', logLine);
    });
}

console.log = (...args) => {
    const message = args.map(arg => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg))).join(' ');
    addLog(`[INFO] ${message}`);
    originalConsoleLog.apply(console, args);
};

console.warn = (...args) => {
    const message = args.map(arg => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg))).join(' ');
    addLog(`[WARN] ${message}`);
    originalConsoleWarn.apply(console, args);
};

console.error = (...args) => {
    const message = args.map(arg => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg))).join(' ');
    addLog(`[ERROR] ${message}`);
    originalConsoleError.apply(console, args);
};

const createWindow = () => {
    const mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        icon: path.join(__dirname, '../resources/icon.png'),
        webPreferences: {
            preload: path.join(__dirname, '../dist-electron/preload.cjs'),
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    if (app.isPackaged) {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    } else {
        mainWindow.loadURL('http://localhost:3000');
        mainWindow.webContents.openDevTools();
    }
};

const createMenu = () => {
    const template: Electron.MenuItemConstructorOptions[] = [
        {
            label: '文件',
            submenu: [
                {
                    label: '退出',
                    accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Alt+F4',
                    click: () => {
                        app.quit();
                    }
                }
            ]
        },
        {
            label: '编辑',
            submenu: [
                { label: '撤销', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
                { label: '重做', accelerator: 'Shift+CmdOrCtrl+Z', role: 'redo' },
                { type: 'separator' },
                { label: '剪切', accelerator: 'CmdOrCtrl+X', role: 'cut' },
                { label: '复制', accelerator: 'CmdOrCtrl+C', role: 'copy' },
                { label: '粘贴', accelerator: 'CmdOrCtrl+V', role: 'paste' },
                { label: '全选', accelerator: 'CmdOrCtrl+A', role: 'selectAll' }
            ]
        },
        {
            label: '窗口',
            submenu: [
                { label: '最小化', accelerator: 'CmdOrCtrl+M', role: 'minimize' },
                { label: '关闭', accelerator: 'CmdOrCtrl+W', role: 'close' }
            ]
        },
        {
            label: '帮助',
            submenu: [
                {
                    label: '关于',
                    click: () => {
                        dialog.showMessageBox({
                            title: '关于',
                            message: 'Gemini Subtitle Pro',
                            detail: `智能字幕生成与翻译工具 v${app.getVersion()}`
                        });
                    }
                }
            ]
        }
    ];

    if (!app.isPackaged) {
        template.push({
            label: '开发',
            submenu: [
                { label: '重新加载', accelerator: 'CmdOrCtrl+R', role: 'reload' },
                { label: '强制重新加载', accelerator: 'CmdOrCtrl+Shift+R', role: 'forceReload' },
                { type: 'separator' },
                { label: '开发者工具', accelerator: 'CmdOrCtrl+Shift+I', role: 'toggleDevTools' }
            ]
        });
    }

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
};

app.on('ready', async () => {
    createMenu();
    createWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

app.on('before-quit', () => {
    localWhisperService.abort();
});
