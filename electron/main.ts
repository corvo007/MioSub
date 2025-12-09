import { mainLogger } from './logger.ts'; // Must be first!
import { app, BrowserWindow, dialog, ipcMain, Menu, shell, session } from 'electron';
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
  getAudioInfo,
} from './services/ffmpegAudioExtractor.ts';
import type {
  AudioExtractionOptions,
  AudioExtractionProgress,
} from './services/ffmpegAudioExtractor.ts';
import { storageService } from './services/storage.ts';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (squirrelStartup) {
  app.quit();
}

import { localWhisperService } from './services/localWhisper.ts';
import { ytDlpService, classifyError } from './services/ytdlp.ts';
import { VideoCompressorService } from './services/videoCompressor.ts';
import type { CompressionOptions } from './services/videoCompressor.ts';

const videoCompressorService = new VideoCompressorService();

// IPC Handler: Transcribe Local
ipcMain.handle(
  'transcribe-local',
  async (
    _event,
    {
      audioData,
      modelPath,
      language,
      threads,
      customBinaryPath,
    }: {
      audioData: ArrayBuffer;
      modelPath: string;
      language?: string;
      threads?: number;
      customBinaryPath?: string;
    }
  ) => {
    try {
      console.log(
        `[Main] Received local transcription request. Model: ${modelPath}, Lang: ${language}, Threads: ${threads}, CustomPath: ${customBinaryPath}`
      );
      const result = await localWhisperService.transcribe(
        audioData,
        modelPath,
        language,
        threads,
        (msg) => console.log(msg),
        customBinaryPath
      );
      return { success: true, segments: result };
    } catch (error: any) {
      console.error('[Main] Local transcription failed:', error);
      return { success: false, error: error.message };
    }
  }
);

// IPC Handler: Abort Local Whisper
ipcMain.handle('local-whisper-abort', async () => {
  console.log('[Main] Aborting all local whisper processes');
  localWhisperService.abort();
  return { success: true };
});

// IPC Handler: Select Media File (for history support)
ipcMain.handle('select-media-file', async () => {
  try {
    const result = await dialog.showOpenDialog({
      title: '选择媒体文件',
      filters: [
        { name: '视频文件', extensions: ['mp4', 'mkv', 'avi', 'mov', 'webm', 'flv', 'wmv'] },
        { name: '音频文件', extensions: ['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'wma'] },
        { name: '所有文件', extensions: ['*'] },
      ],
      properties: ['openFile'],
    });

    if (!result.canceled && result.filePaths.length > 0) {
      const filePath = result.filePaths[0];
      // Get file stats
      const stats = await fs.promises.stat(filePath);
      const fileName = path.basename(filePath);
      const ext = path.extname(filePath).toLowerCase();

      // Determine MIME type
      const videoExts = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.flv', '.wmv'];
      const audioExts = ['.mp3', '.wav', '.flac', '.aac', '.m4a', '.ogg', '.wma'];
      let mimeType = 'application/octet-stream';
      if (videoExts.includes(ext)) {
        mimeType =
          ext === '.mp4'
            ? 'video/mp4'
            : ext === '.mkv'
              ? 'video/x-matroska'
              : `video/${ext.slice(1)}`;
      } else if (audioExts.includes(ext)) {
        mimeType = ext === '.mp3' ? 'audio/mpeg' : `audio/${ext.slice(1)}`;
      }

      return {
        success: true,
        filePath,
        fileName,
        size: stats.size,
        type: mimeType,
      };
    }
    return { success: false, canceled: true };
  } catch (error: any) {
    console.error('[Main] Media file selection failed:', error);
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
        { name: '所有文件', extensions: ['*'] },
      ],
      properties: ['openFile'],
    });

    if (!result.canceled && result.filePaths.length > 0) {
      const filePath = result.filePaths[0];
      const validation = localWhisperService.validateModel(filePath);

      if (!validation.valid) {
        return { success: false, error: validation.error || '未知错误' };
      }
      return { success: true, path: filePath };
    }
    return { success: false, canceled: true };
  } catch (error: any) {
    console.error('[Main] Model selection failed:', error);
    return { success: false, error: error.message };
  }
});

// IPC Handler: Save Subtitle Dialog
ipcMain.handle(
  'save-subtitle-dialog',
  async (_event, defaultName: string, content: string, format: 'srt' | 'ass') => {
    try {
      const result = await dialog.showSaveDialog({
        title: '保存字幕文件',
        defaultPath: defaultName,
        filters: [
          { name: format.toUpperCase() + ' 字幕', extensions: [format] },
          { name: '所有文件', extensions: ['*'] },
        ],
      });

      if (!result.canceled && result.filePath) {
        // Ensure Windows line endings
        const windowsContent = content.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
        const bom = '\uFEFF'; // UTF-8 BOM
        await fs.promises.writeFile(result.filePath, bom + windowsContent, 'utf-8');
        return { success: true, path: result.filePath };
      }
      return { success: false, canceled: true };
    } catch (error: any) {
      console.error('[Main] Save subtitle failed:', error);
      return { success: false, error: error.message };
    }
  }
);

// IPC Handler: Save Logs Dialog
ipcMain.handle('save-logs-dialog', async (_event, content: string) => {
  try {
    // Generate local timestamp for filename
    const now = new Date();
    const localTimestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}-${String(now.getMilliseconds()).padStart(3, '0')}Z`;

    const result = await dialog.showSaveDialog({
      title: '导出日志',
      defaultPath: `gemini-subtitle-pro-logs-${localTimestamp}.txt`,
      filters: [
        { name: '文本文件', extensions: ['txt'] },
        { name: '所有文件', extensions: ['*'] },
      ],
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
  async (event, videoPath: string, options: AudioExtractionOptions & { ffprobePath?: string }) => {
    try {
      // Inject ffprobePath from options if available (passed from renderer)
      // Note: The renderer should pass this in the options object
      if (options.ffprobePath) {
        options.customFfprobePath = options.ffprobePath;
      }

      const audioPath = await extractAudioFromVideo(
        videoPath,
        options,
        (progress: AudioExtractionProgress) => {
          // 向渲染进程发送进度更新
          event.sender.send('audio-extraction-progress', progress);
        },
        (logMessage: string) => {
          // Capture FFmpeg logs
          if (logMessage.startsWith('[DEBUG]')) {
            console.log(`[DEBUG] [FFmpeg] ${logMessage.replace('[DEBUG] ', '')}`);
          } else {
            console.log(`[FFmpeg] ${logMessage}`);
          }
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

// IPC Handler: 读取音频文件 (Fallback)
ipcMain.handle('read-audio-file', async (_event, filePath: string) => {
  try {
    const buffer = await fs.promises.readFile(filePath);
    return buffer.buffer;
  } catch (error: any) {
    console.error('[Main] Failed to read audio file:', error);
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

// IPC Handler: History
ipcMain.handle('history-get', async () => {
  try {
    return await storageService.readHistory();
  } catch (error: any) {
    console.error('[Main] Failed to read history:', error);
    return [];
  }
});

ipcMain.handle('history-save', async (_event, histories: any[]) => {
  try {
    return await storageService.saveHistory(histories);
  } catch (error: any) {
    console.error('[Main] Failed to save history:', error);
    return false;
  }
});

ipcMain.handle('history-delete', async (_event, id: string) => {
  try {
    return await storageService.deleteHistoryItem(id);
  } catch (error: any) {
    console.error('[Main] Failed to delete history:', error);
    return false;
  }
});

// IPC Handler: Snapshots
ipcMain.handle('snapshots-get', async () => {
  try {
    return await storageService.readSnapshots();
  } catch (error: any) {
    console.error('[Main] Failed to read snapshots:', error);
    return [];
  }
});

ipcMain.handle('snapshots-save', async (_event, snapshots: any[]) => {
  try {
    return await storageService.saveSnapshots(snapshots);
  } catch (error: any) {
    console.error('[Main] Failed to save snapshots:', error);
    return false;
  }
});

// IPC Handler: Read Local File (Bypass CSP/Sandbox for local playback)
ipcMain.handle('read-local-file', async (event, filePath) => {
  try {
    const buffer = await fs.promises.readFile(filePath);
    return buffer;
  } catch (error) {
    console.error('Failed to read file:', error);
    throw error;
  }
});

// IPC Handler: Write Temp File (for subtitles)
ipcMain.handle('util:write-temp', async (_event, content: string, extension: string) => {
  try {
    const tempDir = app.getPath('temp');
    const fileName = `gemini_subtitle_temp_${Date.now()}.${extension.replace(/^\./, '')}`;
    const filePath = path.join(tempDir, fileName);
    // Add BOM for Windows compatibility
    const bom = '\uFEFF';
    await fs.promises.writeFile(filePath, bom + content, 'utf-8');
    return { success: true, path: filePath };
  } catch (error: any) {
    console.error('[Main] Failed to write temp file:', error);
    return { success: false, error: error.message };
  }
});

// IPC Handler: Video Compression
ipcMain.handle(
  'video:compress',
  async (event, inputPath: string, outputPath: string, options: CompressionOptions) => {
    try {
      return await videoCompressorService.compress(
        inputPath,
        outputPath,
        options,
        (progress) => {
          event.sender.send('video:compression-progress', progress);
        },
        (logMessage) => {
          console.log(logMessage);
        }
      );
    } catch (error: any) {
      console.error('[Main] Compression failed:', error);
      throw error;
    }
  }
);

ipcMain.handle('video:get-info', async (_event, filePath: string) => {
  try {
    return await videoCompressorService.probe(filePath);
  } catch (error: any) {
    console.error('[Main] Failed to get video info:', error);
    throw error;
  }
});

// IPC Handler: Video Compression Cancel
ipcMain.handle('video:cancel', async () => {
  console.log('[Main] Cancelling video compression');
  const cancelled = videoCompressorService.cancel();
  return { success: cancelled };
});

// IPC Handler: Show Item In Folder
ipcMain.handle('shell:show-item-in-folder', async (_event, filePath: string) => {
  try {
    shell.showItemInFolder(filePath);
    return true;
  } catch (e) {
    console.error('Failed to show item in folder:', e);
    return false;
  }
});

// IPC Handler: Video Download - Parse URL
ipcMain.handle('download:parse', async (_event, url: string) => {
  try {
    console.log(`[Main] Parsing video URL: ${url}`);
    const videoInfo = await ytDlpService.parseUrl(url);
    return { success: true, videoInfo };
  } catch (error: any) {
    console.error('[Main] Failed to parse URL:', error);
    const classifiedError = classifyError(error.message || error.toString());
    return { success: false, error: classifiedError.message, errorInfo: classifiedError };
  }
});

// IPC Handler: Video Download - Start Download
ipcMain.handle(
  'download:start',
  async (
    event,
    { url, formatId, outputDir }: { url: string; formatId: string; outputDir: string }
  ) => {
    try {
      console.log(`[Main] Starting download: ${url}, format: ${formatId}`);
      const outputPath = await ytDlpService.download(url, formatId, outputDir, (progress) => {
        event.sender.send('download:progress', progress);
      });
      return { success: true, outputPath };
    } catch (error: any) {
      console.error('[Main] Download failed:', error);
      const classifiedError = classifyError(error.message || error.toString());
      return { success: false, error: classifiedError.message, errorInfo: classifiedError };
    }
  }
);

// IPC Handler: Video Download - Cancel
ipcMain.handle('download:cancel', async () => {
  console.log('[Main] Cancelling download');
  ytDlpService.abort();
  return { success: true };
});

// IPC Handler: Video Download - Select Output Directory
ipcMain.handle('download:select-dir', async () => {
  try {
    const result = await dialog.showOpenDialog({
      title: '选择下载目录',
      properties: ['openDirectory'],
    });
    if (!result.canceled && result.filePaths.length > 0) {
      return { success: true, path: result.filePaths[0] };
    }
    return { success: false, canceled: true };
  } catch (error: any) {
    console.error('[Main] Failed to select directory:', error);
    return { success: false, error: error.message };
  }
});

// IPC Handler: Video Download - Get Default Output Dir
ipcMain.handle('download:default-dir', async () => {
  return { success: true, path: ytDlpService.getDefaultOutputDir() };
});

// IPC Handler: Get Main Logs (Recent History)
ipcMain.handle('log:get-history', async () => {
  return mainLogger.getLogs();
});

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    icon: path.join(__dirname, '../resources/icon.png'),
    backgroundColor: '#1a0f2e', // 深紫色背景，与主界面协调
    webPreferences: {
      preload: path.join(__dirname, '../dist-electron/preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
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
          },
        },
      ],
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
        { label: '全选', accelerator: 'CmdOrCtrl+A', role: 'selectAll' },
      ],
    },
    {
      label: '窗口',
      submenu: [
        { label: '最小化', accelerator: 'CmdOrCtrl+M', role: 'minimize' },
        { label: '关闭', accelerator: 'CmdOrCtrl+W', role: 'close' },
      ],
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '关于',
          click: () => {
            const win = BrowserWindow.getFocusedWindow();
            if (win) {
              win.webContents.send('show-about');
            }
          },
        },
      ],
    },
  ];

  if (!app.isPackaged) {
    template.push({
      label: '开发',
      submenu: [
        { label: '重新加载', accelerator: 'CmdOrCtrl+R', role: 'reload' },
        { label: '强制重新加载', accelerator: 'CmdOrCtrl+Shift+R', role: 'forceReload' },
        { type: 'separator' },
        { label: '开发者工具', accelerator: 'CmdOrCtrl+Shift+I', role: 'toggleDevTools' },
      ],
    });
  }

  const menu = Menu.buildFromTemplate(template);
  // 只在开发环境显示菜单栏，生产环境隐藏以避免白色菜单栏的视觉违和感
  if (!app.isPackaged) {
    Menu.setApplicationMenu(menu);
  } else {
    Menu.setApplicationMenu(null);
  }
};

app.on('ready', async () => {
  // Initialize logger file system (requires app to be ready for getPath)
  mainLogger.init();

  // Intercept Bilibili image requests to add Referer header
  // This bypasses the 403 Forbidden error due to anti-hotlinking
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['*://*.hdslb.com/*', '*://*.hdslb.net/*'] },
    (details, callback) => {
      details.requestHeaders['Referer'] = 'https://www.bilibili.com/';
      callback({ requestHeaders: details.requestHeaders });
    }
  );

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
