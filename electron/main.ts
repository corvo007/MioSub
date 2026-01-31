import * as Sentry from '@sentry/electron/main';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  shell,
  session,
  screen,
  protocol,
} from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables BEFORE Sentry init (dev mode only)
if (!app.isPackaged) {
  dotenv.config({ path: path.join(__dirname, '../.env') });
}

import { isPortableMode } from './utils/paths.ts';

// Import mainLogger BEFORE any console.log calls to ensure all logs are captured
import { mainLogger } from './logger.ts';

// Initialize Sentry for error tracking
const SENTRY_DSN = process.env.VITE_SENTRY_DSN;
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    release: process.env.APP_VERSION || app.getVersion(),
    environment: app.isPackaged ? 'production' : 'development',
    beforeSend(event, hint) {
      const originalException = hint.originalException;
      if (
        originalException &&
        (originalException instanceof Error || typeof originalException === 'object') &&
        (originalException as any).isExpected === true
      ) {
        return null;
      }
      return event;
    },
  });

  const appMode = !app.isPackaged ? 'development' : isPortableMode() ? 'portable' : 'installed';
  Sentry.setTag('app_mode', appMode);

  console.log(
    `[Main] Sentry initialized in ${app.isPackaged ? 'production' : 'development'} mode, release: ${process.env.APP_VERSION || app.getVersion()}, mode: ${appMode}`
  );
}

import squirrelStartup from 'electron-squirrel-startup';
import fs from 'fs';
import { getBinaryPath, getFileHash, getLogDir, getStorageDir } from './utils/paths.ts';
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
import { Readable } from 'stream';

// Helper class for reading growing files (tailing)
class TailingReader extends Readable {
  private filePath: string;
  private fd: number | null = null;
  private position: number;
  private endPosition: number | undefined;
  private pollingInterval: number = 200;
  private idleTime: number = 0;
  private maxIdleTime: number = 30000; // 30s timeout

  constructor(filePath: string, start: number, end?: number) {
    super();
    this.filePath = filePath;
    this.position = start;
    this.endPosition = end;
  }

  _construct(callback: (error?: Error | null) => void) {
    fs.open(this.filePath, 'r', (err, fd) => {
      if (err) return callback(err);
      this.fd = fd;
      callback();
    });
  }

  _read(size: number) {
    if (this.fd === null) return;

    const buffer = Buffer.alloc(64 * 1024); // 64KB chunks
    fs.read(this.fd, buffer, 0, buffer.length, this.position, (err, bytesRead) => {
      if (err) return this.destroy(err);

      if (bytesRead > 0) {
        this.idleTime = 0;
        this.position += bytesRead;
        this.push(buffer.subarray(0, bytesRead));
      } else {
        // EOF reached. Wait and retry if it's a growing file.
        this.idleTime += this.pollingInterval;
        if (this.idleTime > this.maxIdleTime) {
          this.push(null); // Timeout (transcoding probably failed or finished long ago)
        } else {
          setTimeout(() => this._read(size), this.pollingInterval);
        }
      }
    });
  }

  _destroy(err: Error | null, callback: (error?: Error | null) => void) {
    if (this.fd !== null) {
      fs.close(this.fd, (closeErr) => {
        callback(err || closeErr);
      });
      this.fd = null;
    } else {
      callback(err);
    }
  }
}

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (squirrelStartup) {
  app.quit();
}

// IMPORTANT: Must register custom protocol scheme BEFORE app.ready event!
// The 'stream' privilege is required for <video> and <audio> elements to work correctly
// See: https://www.electronjs.org/docs/latest/api/protocol#protocolregisterschemesasprivilegedcustomschemes
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'local-video',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true, // Required for video/audio streaming
      bypassCSP: true, // Bypass Content Security Policy
    },
  },
]);

import { localWhisperService } from './services/localWhisper.ts';
import { ytDlpService, classifyError } from './services/ytdlp.ts';
import { VideoCompressorService } from './services/videoCompressor.ts';
import type { CompressionOptions } from './services/videoCompressor.ts';
import { endToEndPipeline } from './services/endToEndPipeline.ts';
import type { EndToEndConfig } from '@/types/endToEnd.ts';
import { t, changeLanguage } from './i18n.ts';
import { ctcAlignerService } from './services/ctcAligner.ts';
import { writeTempFile } from './services/fileUtils.ts';
import { analyticsService } from './services/analyticsService.ts';
import { initUpdateService } from './services/updateService.ts';

const videoCompressorService = new VideoCompressorService();

// IPC Handler: Analytics Track
// IPC Handler: Analytics Track
ipcMain.handle(
  'analytics:track',
  (_event, signal: string, payload: any, eventType?: 'page_view' | 'interaction' | 'system') => {
    // Fire and forget - don't block Renderer waiting for network
    void analyticsService.track(signal, payload, eventType);
    return { success: true };
  }
);

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
        `[DEBUG] [Main] Received local transcription request. Model: ${modelPath}, Lang: ${language}, Threads: ${threads}, CustomPath: ${customBinaryPath}`
      );

      // Analytics: Transcription Started
      const startAt = Date.now();
      const whisperDetails = await localWhisperService.getWhisperDetails(customBinaryPath);
      void analyticsService.track(
        'transcription_started',
        {
          language,
          model_file: path.basename(modelPath),
          threads,
          use_custom_binary: !!customBinaryPath,
          whisper_version: whisperDetails.version,
          whisper_source: whisperDetails.source,
          use_gpu: whisperDetails.gpuSupport,
        },
        'interaction'
      );

      const result = await localWhisperService.transcribe(
        audioData,
        modelPath,
        language,
        threads,
        (msg) => console.log(msg),
        customBinaryPath
      );

      // Analytics: Transcription Completed
      void analyticsService.track(
        'transcription_completed',
        {
          segment_count: result.length,
          duration_ms: Date.now() - startAt,
        },
        'interaction'
      );

      return { success: true, segments: result };
    } catch (error: any) {
      console.error('[Main] Local transcription failed:', error);

      // Analytics: Transcription Failed (skip if cancelled)
      if (!error.message?.includes('cancelled') && !error.message?.includes('aborted')) {
        Sentry.captureException(error, { tags: { action: 'transcribe-local' } });
        void analyticsService.track(
          'transcription_failed',
          {
            error: error.message,
          },
          'interaction'
        );
      }

      return { success: false, error: error.message };
    }
  }
);

// IPC Handler: Abort Local Whisper
ipcMain.handle('local-whisper-abort', async () => {
  console.log('[DEBUG] [Main] Aborting all local whisper processes');
  localWhisperService.abort();
  return { success: true };
});

// IPC Handler: CTC Alignment
ipcMain.handle('alignment:ctc', async (_event, data: any) => {
  try {
    console.log('[DEBUG] [Main] CTC alignment request received');
    return await ctcAlignerService.align(data);
  } catch (error: any) {
    console.error('[Main] CTC alignment failed:', error);
    if (!error.message?.includes('cancelled')) {
      Sentry.captureException(error, { tags: { action: 'alignment-ctc' } });
    }
    return { success: false, error: error.message };
  }
});

// IPC Handler: Abort CTC Alignment
ipcMain.handle('alignment:ctc-abort', async () => {
  console.log('[DEBUG] [Main] Aborting CTC alignment');
  ctcAlignerService.abort();
  return { success: true };
});

// IPC Handler: Change Language
ipcMain.handle('i18n:change-language', async (_event, lang: string) => {
  try {
    await changeLanguage(lang);
    analyticsService.setAppLanguage(lang);
    console.log(`[Main] Language changed to: ${lang}`);
    return { success: true };
  } catch (error: any) {
    console.error('[Main] Failed to change language:', error);
    return { success: false, error: error.message };
  }
});

// IPC Handler: Select Media File (for history support)
ipcMain.handle('select-media-file', async () => {
  try {
    const result = await dialog.showOpenDialog({
      title: t('dialog.selectMediaFile'),
      filters: [
        {
          name: t('fileFilter.mediaFiles'),
          extensions: [
            // Video
            'mp4',
            'mkv',
            'avi',
            'mov',
            'webm',
            'flv',
            'wmv',
            'mpg',
            'mpeg',
            'm4v',
            'ogv',
            'ts',
            '3gp',
            'ogm',
            'asf',
            'vob',
            // Audio
            'mp3',
            'wav',
            'flac',
            'aac',
            'm4a',
            'ogg',
            'wma',
            'opus',
            'amr',
            'mid',
            'midi',
            'ape',
            'wv',
            'ac3',
            'dts',
          ],
        },
        { name: t('fileFilter.allFiles'), extensions: ['*'] },
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
      const videoExts = [
        '.mp4',
        '.mkv',
        '.avi',
        '.mov',
        '.webm',
        '.flv',
        '.wmv',
        '.mpg',
        '.mpeg',
        '.m4v',
        '.ogv',
        '.ts',
        '.3gp',
        '.ogm',
        '.asf',
        '.vob',
      ];
      const audioExts = [
        '.mp3',
        '.wav',
        '.flac',
        '.aac',
        '.m4a',
        '.ogg',
        '.wma',
        '.opus',
        '.amr',
        '.mid',
        '.midi',
        '.ape',
        '.wv',
        '.ac3',
        '.dts',
      ];
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

// IPC Handler: Select Subtitle File (for native dialog in Electron)
ipcMain.handle('select-subtitle-file', async () => {
  try {
    const result = await dialog.showOpenDialog({
      title: t('dialog.selectSubtitleFile'),
      filters: [
        { name: t('fileFilter.subtitleFiles'), extensions: ['srt', 'ass'] },
        { name: t('fileFilter.allFiles'), extensions: ['*'] },
      ],
      properties: ['openFile'],
    });

    if (!result.canceled && result.filePaths.length > 0) {
      const filePath = result.filePaths[0];
      const fileName = path.basename(filePath);
      const content = await fs.promises.readFile(filePath, 'utf-8');

      return {
        success: true,
        filePath,
        fileName,
        content,
      };
    }
    return { success: false, canceled: true };
  } catch (error: any) {
    console.error('[Main] Subtitle file selection failed:', error);
    return { success: false, error: error.message };
  }
});

// IPC Handler: Select JSON File (for glossary import)
ipcMain.handle('select-json-file', async () => {
  try {
    const result = await dialog.showOpenDialog({
      title: t('dialog.selectJsonFile'),
      filters: [
        { name: t('fileFilter.jsonFiles'), extensions: ['json'] },
        { name: t('fileFilter.allFiles'), extensions: ['*'] },
      ],
      properties: ['openFile'],
    });

    if (!result.canceled && result.filePaths.length > 0) {
      const filePath = result.filePaths[0];
      const fileName = path.basename(filePath);
      const content = await fs.promises.readFile(filePath, 'utf-8');

      return {
        success: true,
        filePath,
        fileName,
        content,
      };
    }
    return { success: false, canceled: true };
  } catch (error: any) {
    console.error('[Main] JSON file selection failed:', error);
    return { success: false, error: error.message };
  }
});

// IPC Handler: Select Whisper Model
ipcMain.handle('select-whisper-model', async () => {
  try {
    const result = await dialog.showOpenDialog({
      title: t('dialog.selectWhisperModel'),
      message: t('dialog.selectWhisperModelMessage'),
      filters: [
        { name: t('fileFilter.whisperModel'), extensions: ['bin'] },
        { name: t('fileFilter.allFiles'), extensions: ['*'] },
      ],
      properties: ['openFile'],
    });

    if (!result.canceled && result.filePaths.length > 0) {
      const filePath = result.filePaths[0];
      const validation = localWhisperService.validateModel(filePath);

      if (!validation.valid) {
        return { success: false, error: validation.error || t('error.unknownError') };
      }
      return { success: true, path: filePath };
    }
    return { success: false, canceled: true };
  } catch (error: any) {
    console.error('[Main] Model selection failed:', error);
    return { success: false, error: error.message };
  }
});

// IPC Handler: Select Whisper Executable
ipcMain.handle('select-whisper-executable', async () => {
  try {
    const result = await dialog.showOpenDialog({
      title: t('dialog.selectWhisperExecutable'),
      filters: [
        { name: t('fileFilter.executableFiles'), extensions: ['exe'] },
        { name: t('fileFilter.allFiles'), extensions: ['*'] },
      ],
      properties: ['openFile'],
    });

    if (!result.canceled && result.filePaths.length > 0) {
      const filePath = result.filePaths[0];
      return { success: true, path: filePath };
    }
    return { success: false, canceled: true };
  } catch (error: any) {
    console.error('[Main] Whisper executable selection failed:', error);
    return { success: false, error: error.message };
  }
});

// IPC Handler: Select Aligner Executable
ipcMain.handle('select-aligner-executable', async () => {
  try {
    const result = await dialog.showOpenDialog({
      title: t('dialog.selectAlignerExecutable'),
      filters: [
        { name: t('fileFilter.executableFiles'), extensions: ['exe'] },
        { name: t('fileFilter.allFiles'), extensions: ['*'] },
      ],
      properties: ['openFile'],
    });

    if (!result.canceled && result.filePaths.length > 0) {
      const filePath = result.filePaths[0];
      // Basic validation: check if file exists and is executable-like
      try {
        const stats = await fs.promises.stat(filePath);
        if (!stats.isFile()) {
          return { success: false, error: t('error.notAFile') };
        }
      } catch {
        return { success: false, error: t('error.fileNotAccessible') };
      }
      return { success: true, path: filePath };
    }
    return { success: false, canceled: true };
  } catch (error: any) {
    console.error('[Main] Aligner executable selection failed:', error);
    return { success: false, error: error.message };
  }
});

// IPC Handler: Select Aligner Model Directory
ipcMain.handle('select-aligner-model-dir', async () => {
  try {
    const result = await dialog.showOpenDialog({
      title: t('dialog.selectAlignerModelDir'),
      properties: ['openDirectory'],
    });

    if (!result.canceled && result.filePaths.length > 0) {
      const dirPath = result.filePaths[0];
      return { success: true, path: dirPath };
    }
    return { success: false, canceled: true };
  } catch (error: any) {
    console.error('[Main] Aligner model directory selection failed:', error);
    return { success: false, error: error.message };
  }
});

// IPC Handler: Save Subtitle Dialog
ipcMain.handle(
  'save-subtitle-dialog',
  async (_event, defaultName: string, content: string, format: 'srt' | 'ass') => {
    try {
      const result = await dialog.showSaveDialog({
        title: t('dialog.saveSubtitleFile'),
        defaultPath: defaultName,
        filters: [
          { name: format.toUpperCase() + ' ' + t('fileFilter.subtitle'), extensions: [format] },
          { name: t('fileFilter.allFiles'), extensions: ['*'] },
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
      Sentry.captureException(error, { tags: { action: 'save-subtitle-dialog' } });
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
      title: t('dialog.exportLogs'),
      defaultPath: `gemini-subtitle-pro-logs-${localTimestamp}.txt`,
      filters: [
        { name: t('fileFilter.textFiles'), extensions: ['txt'] },
        { name: t('fileFilter.allFiles'), extensions: ['*'] },
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

// IPC Handler: Save Debug Artifact (Invisible to user, for debugging)
ipcMain.handle('debug:save-artifact', async (_event, name: string, content: string) => {
  try {
    const logDir = getLogDir();
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const artifactsDir = path.join(logDir, 'artifacts', dateStr);

    if (!fs.existsSync(artifactsDir)) {
      await fs.promises.mkdir(artifactsDir, { recursive: true });
    }

    // Sanitize filename to prevent issues
    const safeName = name.replace(/[^a-zA-Z0-9._-]/g, '_');
    // Add timestamp to filename to prevent overwrites and sort by time
    const timeStr = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}-${String(now.getMilliseconds()).padStart(3, '0')}`;
    const filename = `${timeStr}_${safeName}`;
    const filePath = path.join(artifactsDir, filename);

    await fs.promises.writeFile(filePath, content, 'utf-8');
    // Don't log success to avoid spamming logs
    return true;
  } catch (error: any) {
    console.error(`[Main] Failed to save debug artifact ${name}:`, error);
    return false;
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
            console.log(`[DEBUG] [FFmpeg] ${logMessage}`);
          }
        }
      );
      return { success: true, audioPath };
    } catch (error: any) {
      console.error('[Main] FFmpeg audio extraction failed:', error);
      if (
        !error.message?.includes('cancelled') &&
        !error.message?.includes('SIGKILL') &&
        !error.message?.includes('killed')
      ) {
        Sentry.captureException(error, { tags: { action: 'extract-audio-ffmpeg' } });
      }
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
    Sentry.captureException(error, { tags: { action: 'read-extracted-audio' } });
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
    Sentry.captureException(error, { tags: { action: 'read-audio-file' } });
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
    Sentry.captureException(error, { tags: { action: 'cleanup-temp-audio' } });
    return { success: false, error: error.message };
  }
});

// IPC Handler: Get Audio Info
ipcMain.handle('get-audio-info', async (_event, videoPath: string) => {
  try {
    const info = await getAudioInfo(videoPath);
    return { success: true, info };
  } catch (error: any) {
    console.error('[Main] Failed to get audio info:', error);
    Sentry.captureException(error, { tags: { action: 'get-audio-info' } });
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
    if (data?.language) {
      analyticsService.setAppLanguage(data.language);
    }
    return await storageService.saveSettings(data);
  } catch (error: any) {
    console.error('[Main] Failed to save settings:', error);
    Sentry.captureException(error, { tags: { action: 'storage-set' } });
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
    // Security: Validate path to prevent directory traversal attacks
    const normalizedPath = path.normalize(filePath);
    if (!path.isAbsolute(normalizedPath)) {
      throw new Error(t('error.invalidPath'));
    }
    if (normalizedPath.includes('..')) {
      throw new Error(t('error.relativePathNotAllowed'));
    }

    const buffer = await fs.promises.readFile(normalizedPath);
    return buffer;
  } catch (error) {
    console.error('[Main] Failed to read file:', error);
    throw error;
  }
});

// IPC Handler: Get resource path (for bundled assets like kuromoji dict)
ipcMain.handle('util:get-resource-path', async (_event, resourceName: string) => {
  try {
    // Security: Validate resourceName to prevent path traversal
    if (!resourceName) {
      return { success: false, error: 'Invalid resource name' };
    }

    // Check 1: No absolute paths
    if (path.isAbsolute(resourceName)) {
      console.warn(`[Main] Blocked absolute path resource request: "${resourceName}"`);
      return { success: false, error: 'Absolute paths not allowed' };
    }

    // Check 2: No directory traversal (..)
    if (resourceName.split(/[/\\]/).includes('..')) {
      console.warn(`[Main] Blocked path traversal resource request: "${resourceName}"`);
      return { success: false, error: 'Path traversal not allowed' };
    }

    // Platform-specific handling: Append .exe on Windows if missing
    // This allows the frontend to request 'ffmpeg' and have it resolve to 'ffmpeg.exe' on Windows
    let finalResourceName = resourceName;
    if (process.platform === 'win32' && !resourceName.toLowerCase().endsWith('.exe')) {
      // List of known binary tools to apply this rule to, or apply generally if it looks like a binary request
      // For now, applying generally as most resources in root are binaries or specific files
      finalResourceName = `${resourceName}.exe`;
    }

    const exePath = app.getPath('exe');
    const exeDir = path.dirname(exePath);
    const portableExeDir = process.env.PORTABLE_EXECUTABLE_DIR;

    const possiblePaths: string[] = [];

    if (app.isPackaged) {
      // Portable App
      if (portableExeDir) {
        possiblePaths.push(path.join(portableExeDir, 'resources', finalResourceName));
        possiblePaths.push(path.join(portableExeDir, finalResourceName));
      }
      // Standard/Installed
      possiblePaths.push(path.join(exeDir, 'resources', finalResourceName));
      possiblePaths.push(path.join(exeDir, finalResourceName));
      possiblePaths.push(path.join(process.resourcesPath, finalResourceName));
    } else {
      // Development
      const projectRoot = path.join(app.getAppPath(), '..');
      possiblePaths.push(path.join(projectRoot, 'resources', finalResourceName));
      possiblePaths.push(path.join(app.getAppPath(), 'resources', finalResourceName));
    }

    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        console.log(`[Main] Found resource ${resourceName} (as ${finalResourceName}) at: ${p}`);
        return { success: true, path: p };
      }
    }

    // If not found with .exe, try original name (fallback for non-binary resources on Windows)
    if (finalResourceName !== resourceName) {
      const fallbackPaths = possiblePaths.map((p) => p.replace(finalResourceName, resourceName));
      for (const p of fallbackPaths) {
        if (fs.existsSync(p)) {
          console.log(`[Main] Found resource ${resourceName} at: ${p}`);
          return { success: true, path: p };
        }
      }
    }

    return { success: false, error: `Resource not found: ${resourceName}` };
  } catch (error: any) {
    console.error('[Main] Failed to get resource path:', error);
    return { success: false, error: error.message };
  }
});

// IPC Handler: Write Temp File (for subtitles - text content)
ipcMain.handle('util:write-temp', async (_event, content: string, extension: string) => {
  return await writeTempFile(content, extension, true);
});

// IPC Handler: Write Temp Audio File (for binary audio data)
ipcMain.handle(
  'util:write-temp-audio',
  async (_event, audioData: string | ArrayBuffer, extension: string) => {
    try {
      const tempDir = app.getPath('temp');
      const fileName = `gemini_subtitle_temp_${Date.now()}.${extension.replace(/^\./, '')}`;
      const filePath = path.join(tempDir, fileName);

      let audioBuffer: Buffer;
      if (typeof audioData === 'string') {
        // Legacy: Decode base64 to binary buffer
        audioBuffer = Buffer.from(audioData, 'base64');
      } else {
        // Optimized: Convert ArrayBuffer/Uint8Array to Buffer
        audioBuffer = Buffer.from(audioData);
      }

      await fs.promises.writeFile(filePath, audioBuffer);
      console.log(`[Main] Wrote temp audio file: ${filePath} (${audioBuffer.length} bytes)`);
      return { success: true, path: filePath };
    } catch (error: any) {
      console.error('[Main] Failed to write temp audio file:', error);
      Sentry.captureException(error);
      return { success: false, error: error.message };
    }
  }
);

// IPC Handler: Video Compression
ipcMain.handle(
  'video:compress',
  async (event, inputPath: string, outputPath: string, options: CompressionOptions) => {
    try {
      // Analytics: Start
      const resolution =
        options.width && options.height ? `${options.width}x${options.height}` : 'original';

      void analyticsService.track('compression_started', {
        encoder: options.encoder,
        crf: options.crf,
        hw_accel: options.hwAccel === 'off' ? 'disabled' : 'enabled',
        resolution: resolution,
        subtitle_burned: !!options.subtitlePath,
        video_source: options.videoSource || 'unknown',
        subtitle_source: options.subtitleSource || 'unknown',
      });

      const result = await videoCompressorService.compress(
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

      // Analytics: Success
      void analyticsService.track('compression_completed', { success: true });

      return result;
    } catch (error: any) {
      console.error('[Main] Compression failed:', error);
      Sentry.captureException(error);

      // Analytics: Fail
      void analyticsService.track('compression_failed', { error: error.message });

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
  console.log('[DEBUG] [Main] Cancelling video compression');
  const cancelled = videoCompressorService.cancel();
  return { success: cancelled };
});

// IPC Handler: Get Hardware Acceleration Info
ipcMain.handle('video:hw-accel-info', async () => {
  try {
    return await videoCompressorService.getHardwareAccelInfo();
  } catch (error: any) {
    console.error('[Main] Failed to get hardware acceleration info:', error);
    return {
      available: false,
      encoders: {
        h264_nvenc: false,
        hevc_nvenc: false,
        h264_qsv: false,
        hevc_qsv: false,
        h264_amf: false,
        hevc_amf: false,
      },
      preferredH264: 'libx264',
      preferredH265: 'libx265',
    };
  }
});

// ============================================================================
// Video Preview Transcoding IPC Handlers
// ============================================================================
import {
  transcodeForPreview,
  needsTranscode,
  killAllTranscodes,
  getCacheSize,
  clearCache,
  enforceCacheLimit,
  cancelTranscode,
} from './services/videoPreviewTranscoder.ts';
import { killActiveCompression } from './services/videoCompressor.ts';
import { killAllAudioExtractions } from './services/ffmpegAudioExtractor.ts';

// Kill all active FFmpeg and Whisper processes when app is quitting
app.on('before-quit', () => {
  killAllTranscodes();
  killActiveCompression();
  killAllAudioExtractions();
  localWhisperService.abort();
});

// IPC Handler: Get preview cache size
ipcMain.handle('cache:get-size', async () => {
  return getCacheSize();
});

// IPC Handler: Clear preview cache
ipcMain.handle('cache:clear', async () => {
  return clearCache();
});

// IPC Handler: Transcode video for preview (fragmented MP4 for streaming)
ipcMain.handle('video-preview:transcode', async (event, options: { filePath: string }) => {
  try {
    console.log(`[DEBUG] [Main] Transcoding for preview: ${options.filePath}`);

    // Helper to safely send IPC messages (check if window is still valid)
    const safeSend = (channel: string, data: any) => {
      try {
        if (!event.sender.isDestroyed()) {
          event.sender.send(channel, data);
        }
      } catch {
        // Ignore errors if window was destroyed
      }
    };

    const result = await transcodeForPreview({
      filePath: options.filePath,
      onStart: (outputPath, duration) => {
        safeSend('video-preview:transcode-start', { outputPath, duration });
      },
      onProgress: (percent, transcodedDuration) => {
        safeSend('video-preview:transcode-progress', { percent, transcodedDuration });
      },
      onLog: (msg) => console.log(msg),
    });
    return { success: true, ...result };
  } catch (error: any) {
    console.error('[Main] Preview transcode failed:', error);
    Sentry.captureException(error);
    return { success: false, error: error.message };
  }
});

// IPC Handler: Check if file needs transcoding
ipcMain.handle('video-preview:needs-transcode', async (_event, filePath: string) => {
  return needsTranscode(filePath);
});

// IPC Handler: Cancel transcoding for a file
ipcMain.handle('video-preview:cancel', async (_event, filePath: string) => {
  return { success: cancelTranscode(filePath) };
});

// Cleanup old preview files and enforce cache limit on app start
// void cleanupOldPreviews(); // Removed
void enforceCacheLimit();

// IPC Handler: Show Item In Folder
ipcMain.handle('shell:show-item-in-folder', async (_event, filePath: string) => {
  try {
    shell.showItemInFolder(filePath);
    return true;
  } catch (e) {
    console.error('[Main] Failed to show item in folder:', e);
    return false;
  }
});

// IPC Handler: Video Download - Parse URL
ipcMain.handle('download:parse', async (_event, url: string) => {
  try {
    console.log(`[DEBUG] [Main] Parsing video URL: ${url}`);
    const videoInfo = await ytDlpService.parseUrl(url);

    // Analytics: Parse Success
    try {
      void analyticsService.track('download_parsed', {
        url_domain: new URL(url).hostname,
        success: true,
      });
    } catch {
      /* ignore */
    }

    return { success: true, videoInfo };
  } catch (error: any) {
    console.error('[Main] Failed to parse URL:', error);

    // Analytics: Parse Fail
    try {
      void analyticsService.track('download_parsed', {
        url_domain: new URL(url).hostname,
        success: false,
        error: error.message,
      });
    } catch {
      /* ignore */
    }

    const classifiedError = classifyError(error.message || error.toString());
    // Only report unknown errors to Sentry (not expected errors like private video, geo-blocked, etc.)
    if (classifiedError.type === 'unknown') {
      Sentry.captureException(error, { tags: { action: 'download-parse' } });
    }
    return { success: false, error: classifiedError.message, errorInfo: classifiedError };
  }
});

// IPC Handler: Video Download - Cancel Parse URL
ipcMain.handle('download:cancel-parse', async (_event, url: string) => {
  const success = ytDlpService.cancelParse(url);
  return { success };
});

// IPC Handler: Video Download - Start Download
ipcMain.handle(
  'download:start',
  async (
    event,
    { url, formatId, outputDir }: { url: string; formatId: string; outputDir: string }
  ) => {
    try {
      console.log(`[DEBUG] [Main] Starting download: ${url}, format: ${formatId}`);

      // Analytics: Start
      try {
        void analyticsService.track('download_started', {
          url_domain: new URL(url).hostname,
          format: formatId,
        });
      } catch (e) {
        /* ignore URL parse err */
      }

      const outputPath = await ytDlpService.download(url, formatId, outputDir, (progress) => {
        event.sender.send('download:progress', progress);
      });

      // Analytics: Success
      void analyticsService.track('download_completed', { success: true });

      return { success: true, outputPath };
    } catch (error: any) {
      console.error('[Main] Download failed:', error);

      // Analytics: Fail
      void analyticsService.track('download_failed', { error: error.message });

      const classifiedError = classifyError(error.message || error.toString());
      // Only report unknown errors to Sentry (not expected errors like network, rate_limit, etc.)
      if (classifiedError.type === 'unknown') {
        Sentry.captureException(error, { tags: { action: 'download-start' } });
      }
      return { success: false, error: classifiedError.message, errorInfo: classifiedError };
    }
  }
);

// IPC Handler: Video Download - Cancel
ipcMain.handle('download:cancel', async () => {
  console.log('[DEBUG] [Main] Cancelling download');
  ytDlpService.abort();
  return { success: true };
});

// IPC Handler: Video Download - Select Output Directory
ipcMain.handle('download:select-dir', async () => {
  try {
    const result = await dialog.showOpenDialog({
      title: t('dialog.selectDownloadDir'),
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

// IPC Handler: Video Download - Download Thumbnail
ipcMain.handle(
  'download:thumbnail',
  async (
    _event,
    {
      thumbnailUrl,
      outputDir,
      videoTitle,
      videoId,
    }: {
      thumbnailUrl: string;
      outputDir: string;
      videoTitle: string;
      videoId: string;
    }
  ) => {
    try {
      console.log(`[DEBUG] [Main] Downloading thumbnail: ${videoTitle}`);
      const thumbnailPath = await ytDlpService.downloadThumbnail(
        thumbnailUrl,
        outputDir,
        videoTitle,
        videoId
      );
      return { success: true, thumbnailPath };
    } catch (error: any) {
      console.error('[Main] Thumbnail download failed:', error);

      const errorMsg = error.message || error.toString();
      const isNetworkError =
        errorMsg.includes('HTTP 404') ||
        errorMsg.includes('HTTP 5') || // Server errors
        errorMsg.includes('封面下载失败: HTTP') || // Generic HTTP error from downloadThumbnail
        errorMsg.includes('超时') ||
        errorMsg.includes('timeout') ||
        errorMsg.includes('ETIMEDOUT') ||
        errorMsg.includes('ECONNRESET') ||
        errorMsg.includes('ENOTFOUND') ||
        errorMsg.toLowerCase().includes('ssl') ||
        errorMsg.toLowerCase().includes('cert') ||
        errorMsg.toLowerCase().includes('handshake');

      if (!isNetworkError) {
        Sentry.captureException(error, { tags: { action: 'download-thumbnail' } });
      }

      return { success: false, error: error.message };
    }
  }
);

// IPC Handler: Get Main Logs (Recent History)
ipcMain.handle('log:get-history', async () => {
  return mainLogger.getLogs();
});

// IPC Handler: Receive logs from renderer process and write to file
ipcMain.on('log:from-renderer', (_event, entry: { level: string; message: string; data?: any }) => {
  const { level, message, data } = entry;
  // Prepend [Renderer] to distinguish from main process logs
  const prefixedMessage = `[Renderer] ${message}`;
  // Log directly with data object - MainLogger will handle both
  // structuring it for UI and stringifying it for file/terminal
  switch (level) {
    case 'DEBUG':
      if (data !== undefined) console.debug(prefixedMessage, data);
      else console.debug(prefixedMessage);
      break;
    case 'INFO':
      if (data !== undefined) console.log(prefixedMessage, data);
      else console.log(prefixedMessage);
      break;
    case 'WARN':
      if (data !== undefined) console.warn(prefixedMessage, data);
      else console.warn(prefixedMessage);
      break;
    case 'ERROR':
      if (data !== undefined) console.error(prefixedMessage, data);
      else console.error(prefixedMessage);
      break;
    default:
      if (data !== undefined) console.log(prefixedMessage, data);
      else console.log(prefixedMessage);
  }
});

// ============================================================================
// End-to-End Pipeline IPC Handlers
// ============================================================================

// Store reference to main window for pipeline progress updates
let mainWindowRef: BrowserWindow | null = null;

// IPC Handler: Start End-to-End Pipeline
ipcMain.handle('end-to-end:start', async (event, config: EndToEndConfig) => {
  try {
    console.log(`[DEBUG] [Main] Starting end-to-end pipeline: ${config.url}`);

    // Track Pipeline Start
    void analyticsService.track('pipeline_started', {
      url_domain: new URL(config.url).hostname,
      model: config.useLocalWhisper ? config.whisperModel : 'api',
      target_language: config.targetLanguage,
    });

    // Get the main window from the event sender
    mainWindowRef = BrowserWindow.fromWebContents(event.sender);
    if (mainWindowRef) {
      endToEndPipeline.setMainWindow(mainWindowRef);
    }

    const result = await endToEndPipeline.execute(config, (progress) => {
      // Send progress updates to renderer
      event.sender.send('end-to-end:progress', progress);
    });

    // Track Success
    void analyticsService.track('pipeline_completed', {
      success: result.success,
      duration: result.duration,
      chunk_durations: result.chunkAnalytics,
    });

    return result;
  } catch (error: any) {
    console.error('[Main] End-to-end pipeline failed:', error);

    // Track Failure
    void analyticsService.track('pipeline_failed', {
      error: error.message,
    });
    return {
      success: false,
      error: error.message,
      finalStage: 'failed',
      outputs: {},
      duration: 0,
    };
  }
});

// IPC Handler: Abort End-to-End Pipeline
ipcMain.handle('end-to-end:abort', async () => {
  console.log('[DEBUG] [Main] Aborting end-to-end pipeline');
  endToEndPipeline.abort();
  return { success: true };
});

// IPC Handler: Get Pipeline Status
ipcMain.handle('end-to-end:status', async () => {
  return endToEndPipeline.getStatus();
});

// ============================================================================
// SECURITY: open-external IPC handler with URL validation
// ============================================================================
// Whitelist of allowed domains for shell.openExternal
const ALLOWED_EXTERNAL_HOSTS = [
  'huggingface.co',
  'github.com',
  'www.bilibili.com',
  'bilibili.com',
  'youtube.com',
  'www.youtube.com',
  'electronjs.org',
  'www.electronjs.org',
];

ipcMain.handle('open-external', async (_event, url: string) => {
  try {
    const parsedUrl = new URL(url);

    // Only allow https and http protocols
    if (!['https:', 'http:'].includes(parsedUrl.protocol)) {
      console.warn(
        `[Security] Blocked shell.openExternal - invalid protocol: ${parsedUrl.protocol}`
      );
      return { success: false, error: `Blocked protocol: ${parsedUrl.protocol}` };
    }

    // Check if host is in whitelist
    const isAllowed = ALLOWED_EXTERNAL_HOSTS.some(
      (host) => parsedUrl.host === host || parsedUrl.host.endsWith(`.${host}`)
    );

    if (!isAllowed) {
      console.warn(
        `[Security] Blocked shell.openExternal - host not whitelisted: ${parsedUrl.host}`
      );
      return { success: false, error: `Host not allowed: ${parsedUrl.host}` };
    }

    await shell.openExternal(url);
    console.log(`[DEBUG] [Security] Allowed shell.openExternal: ${url}`);
    return { success: true };
  } catch (error: any) {
    console.error('[Security] shell.openExternal failed:', error);
    return { success: false, error: error.message };
  }
});

let splashWindow: BrowserWindow | null = null;

const createSplashWindow = () => {
  splashWindow = new BrowserWindow({
    width: 340,
    height: 340,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    movable: false,
    icon: path.join(__dirname, '../resources/icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  splashWindow.loadFile(path.join(__dirname, './splash.html')).catch(console.error);
  splashWindow.center();
};

const createWindow = () => {
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;

  // Calculate generic 80% size or fallback to hardcoded
  const defaultWidth = 1400;
  const defaultHeight = 900;

  // Ensure window fits on screen (important for high DPI / high scaling)
  const width = Math.min(defaultWidth, Math.floor(screenWidth * 0.9));
  const height = Math.min(defaultHeight, Math.floor(screenHeight * 0.9));

  const mainWindow = new BrowserWindow({
    width,
    height,
    show: false, // Hide initially, wait for ready-to-show
    minWidth: 800,
    minHeight: 600, // Reduced min height to be safer on small logic screens
    icon: path.join(__dirname, '../resources/icon.png'),
    backgroundColor: '#f3f4f6', // 浅色背景，与主界面协调
    webPreferences: {
      preload: path.join(__dirname, '../dist-electron/preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true, // Explicitly enable sandbox for renderer process isolation
    },
    useContentSize: true, // Ensure content fits within the window
  });

  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html')).catch(console.error);
  } else {
    mainWindow.loadURL('http://localhost:3000').catch(console.error);
    mainWindow.webContents.openDevTools();
  }

  // Graceful showing: Wait for content to render
  mainWindow.once('ready-to-show', () => {
    // Add a small delay to ensure visual smoothness (optional, can be removed if specific splash feels too long)
    // setTimeout(() => {
    mainWindow.show();
    if (splashWindow) {
      splashWindow.destroy();
      splashWindow = null;
    }
    // }, 500);
  });

  // Initialize update service
  initUpdateService(mainWindow);
};

const createMenu = () => {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: t('menu.file'),
      submenu: [
        {
          label: t('menu.exit'),
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Alt+F4',
          click: () => {
            app.quit();
          },
        },
      ],
    },
    {
      label: t('menu.edit'),
      submenu: [
        { label: t('menu.undo'), accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: t('menu.redo'), accelerator: 'Shift+CmdOrCtrl+Z', role: 'redo' },
        { type: 'separator' },
        { label: t('menu.cut'), accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: t('menu.copy'), accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: t('menu.paste'), accelerator: 'CmdOrCtrl+V', role: 'paste' },
        { label: t('menu.selectAll'), accelerator: 'CmdOrCtrl+A', role: 'selectAll' },
      ],
    },
    {
      label: t('menu.window'),
      submenu: [
        { label: t('menu.minimize'), accelerator: 'CmdOrCtrl+M', role: 'minimize' },
        { label: t('menu.close'), accelerator: 'CmdOrCtrl+W', role: 'close' },
      ],
    },
  ];

  if (!app.isPackaged) {
    template.push({
      label: t('menu.dev'),
      submenu: [
        { label: t('menu.reload'), accelerator: 'CmdOrCtrl+R', role: 'reload' },
        { label: t('menu.forceReload'), accelerator: 'CmdOrCtrl+Shift+R', role: 'forceReload' },
        { type: 'separator' },
        { label: t('menu.devTools'), accelerator: 'CmdOrCtrl+Shift+I', role: 'toggleDevTools' },
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

  // Initialize Analytics with version info
  // Initialize Analytics with version info (non-blocking)
  void (async () => {
    try {
      const config = await getSystemConfigHash();
      const versionStr = `${config.pkg.version} (${config.commitHash})`;
      await analyticsService.initialize(versionStr);
    } catch (error) {
      console.error('[Main] Failed to get system config for analytics:', error);
      await analyticsService.initialize();
    }

    // Log identity for debugging
    console.log(`[Main] Debug ID: ${analyticsService.getUserId()}`);
    console.log(`[Main] Session ID: ${analyticsService.getSessionId()}`);
  })();

  // Print startup system info and cache it
  void (async () => {
    try {
      const info = await getSystemInfo();
      // Cache the info at startup so About tab can use it immediately
      lastAboutInfo = info;
      lastAboutConfigHash = info.hash;

      console.log('========================================');
      console.log('  MioSub - System Info');
      console.log('========================================');
      console.log(`  Version:      v${info.version} (${info.commitHash})`);
      console.log(`  Environment:  ${info.isPackaged ? 'Production' : 'Development'}`);
      console.log('');
      console.log('  Dependencies:');
      console.log(`    FFmpeg:     ${info.versions.ffmpeg}`);
      console.log(`    FFprobe:    ${info.versions.ffprobe}`);
      console.log(`    yt-dlp:     ${info.versions.ytdlp}`);
      console.log(`    QuickJS:    ${info.versions.qjs}`);
      console.log(`    Whisper:    ${info.versions.whisper}`);
      console.log(`    Aligner:    ${info.versions.aligner}`);
      console.log('');
      console.log('  GPU Acceleration:');
      console.log(
        `    Encoder:    ${info.gpu.available ? `Supported (${info.gpu.preferredH264}/${info.gpu.preferredH265})` : 'Not Supported'}`
      );
      console.log(
        `    Whisper:    ${info.versions.whisperDetails.gpuSupport ? 'Supported (GPU)' : 'Not Supported'}`
      );
      console.log('');
      console.log('  Paths:');
      console.log(`    App:        ${info.paths.appPath}`);
      console.log(`    UserData:   ${info.paths.userDataPath}`);
      console.log(`    Executable: ${info.paths.exePath}`);
      console.log(`    Whisper:    ${info.paths.whisperPath || 'N/A'}`);
      console.log('========================================\n');
    } catch (error) {
      console.error('[Main] Failed to print startup info:', error);
    }
  })();

  // Register custom protocol for streaming local video files
  // This supports HTTP range requests for large files
  protocol.handle('local-video', async (request) => {
    try {
      // URL format: local-video://file/<encoded-path>
      // Extract and decode the file path
      // Strip "local-video://file/" and decode
      const rawUrl = request.url.replace('local-video://file/', '');

      // Separate path and query
      const [pathPart, queryPart] = rawUrl.split('?');
      const searchParams = new URLSearchParams(queryPart || '');
      const isStatic = searchParams.get('static') === 'true';

      const decodedPath = decodeURIComponent(pathPart);
      const filePath = path.normalize(decodedPath);

      // Security check: ensure absolute path and no traversal if possible (though we normalized)
      // Actually we just use it.

      // Check if file exists
      if (!fs.existsSync(filePath)) {
        console.error('[local-video] File not found:', filePath);
        return new Response('File not found: ' + filePath, { status: 404 });
      }

      const stat = fs.statSync(filePath);
      const fileSize = stat.size;

      // Handle empty files gracefully
      if (fileSize === 0) {
        return new Response(null, {
          status: 200,
          headers: {
            'Content-Length': '0',
            'Content-Type': 'video/mp4',
            'Accept-Ranges': 'bytes',
          },
        });
      }

      // Special handling for preview files (growing files)
      // We lie about the size to allow progressive playback of growing content
      // BUT if 'static=true' is passed, we treat it as a finished file
      const isPreview = !isStatic && filePath.replace(/\\/g, '/').includes('/preview/');

      const rangeHeader = request.headers.get('range');

      if (isPreview) {
        // Use unknown total size (*) to support growing files properly
        // This tells the browser "we have data from X onwards, but we don't know the end"

        let start = 0;
        // We don't define an end for the stream reader, it reads until timeout

        if (rangeHeader) {
          const parts = rangeHeader.replace(/bytes=/, '').split('-');
          start = parseInt(parts[0], 10);
          // Ignore requested end for growing files, we stream what we have/get
        }

        const stream = new TailingReader(filePath, start);

        return new Response(stream as any, {
          status: 206,
          headers: {
            'Content-Range': `bytes ${start}-/*`, // * indicates unknown total length
            'Accept-Ranges': 'bytes',
            'Content-Type': 'video/mp4',
            // Omit Content-Length or keep it undefined to let streaming work?
            // Electron might need it?
            // Safe bet is usually to omit it for chunked/streamed,
            // OR set it to a arbitrary large number if we want to pretend?
            // Let's omit it and see if Response handles it (Transfer-Encoding: chunked)
          },
        });
      }

      // Normal static file handling
      if (rangeHeader) {
        // Handle range request for seeking in large files
        const parts = rangeHeader.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        let end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

        // Ensure end is within bounds and valid
        if (end < start) end = start;
        if (end >= fileSize) end = fileSize - 1;

        const chunkSize = end - start + 1;

        const stream = fs.createReadStream(filePath, { start, end });

        return new Response(stream as any, {
          status: 206,
          headers: {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': String(chunkSize),
            'Content-Type': 'video/mp4',
          },
        });
      } else {
        // No range request - return full file
        const stream = fs.createReadStream(filePath);
        return new Response(stream as any, {
          status: 200,
          headers: {
            'Accept-Ranges': 'bytes',
            'Content-Length': String(fileSize),
            'Content-Type': 'video/mp4',
          },
        });
      }
    } catch (error) {
      console.error('[local-video] Protocol error:', error);
      return new Response('Internal Server Error', { status: 500 });
    }
  });

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
  createSplashWindow(); // Show splash immediately
  createWindow(); // Create main window in background
});

// ============================================================================
// SECURITY: Restrict navigation and new window creation
// ============================================================================
app.on('web-contents-created', (_event, contents) => {
  // Add context menu for text inputs (copy, paste, cut, etc.)
  contents.on('context-menu', (_event, params) => {
    const { isEditable, selectionText, editFlags } = params;

    // Only show menu for editable fields or when text is selected
    if (isEditable || selectionText) {
      const menuItems: Electron.MenuItemConstructorOptions[] = [];

      if (isEditable) {
        menuItems.push(
          { label: t('menu.undo'), role: 'undo', enabled: editFlags.canUndo },
          { label: t('menu.redo'), role: 'redo', enabled: editFlags.canRedo },
          { type: 'separator' }
        );
      }

      menuItems.push(
        { label: t('menu.cut'), role: 'cut', enabled: editFlags.canCut },
        { label: t('menu.copy'), role: 'copy', enabled: editFlags.canCopy },
        { label: t('menu.paste'), role: 'paste', enabled: editFlags.canPaste },
        { type: 'separator' },
        { label: t('menu.selectAll'), role: 'selectAll', enabled: editFlags.canSelectAll }
      );

      const contextMenu = Menu.buildFromTemplate(menuItems);
      contextMenu.popup();
    }
  });

  // Restrict navigation to prevent XSS-based redirects
  contents.on('will-navigate', (event, navigationUrl) => {
    try {
      const parsedUrl = new URL(navigationUrl);

      // In development, allow localhost
      if (!app.isPackaged && parsedUrl.origin === 'http://localhost:3000') {
        return; // Allow navigation
      }

      // In production, block all navigation (app loads from file://)
      console.warn(`[Security] Blocked navigation to: ${navigationUrl}`);
      event.preventDefault();
    } catch (error) {
      console.error('[Security] Navigation URL parse error:', error);
      event.preventDefault();
    }
  });

  // Block all new window creation - external links should use shell.openExternal
  contents.setWindowOpenHandler(({ url }) => {
    console.warn(`[Security] Blocked window.open to: ${url}`);

    // Optionally open safe URLs in external browser
    try {
      const parsedUrl = new URL(url);
      if (['https:', 'http:'].includes(parsedUrl.protocol)) {
        const isAllowed = ALLOWED_EXTERNAL_HOSTS.some(
          (host) => parsedUrl.host === host || parsedUrl.host.endsWith(`.${host}`)
        );
        if (isAllowed) {
          setImmediate(() => shell.openExternal(url));
        }
      }
    } catch (error) {
      console.error('[Security] window.open URL parse error:', error);
    }

    return { action: 'deny' };
  });
});

// About info cache
let lastAboutInfo: any = null;
let lastAboutConfigHash: string | null = null;
let cachedCommitHash: string | null = null;

/**
 * Calculate system configuration hash based on settings, environment AND file mtimes.
 * This ensures updates to binaries (even in-place) are detected.
 */
async function getSystemConfigHash() {
  const pkgPath = path.join(__dirname, '../package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

  // Read settings
  const settings = await storageService.readSettings();
  const customWhisperPath = settings?.debug?.whisperPath;
  const customAlignerPath = settings?.enhance?.alignment?.alignerPath;

  // Resolve ACTUAL binary paths to detect auto-discovery or in-place updates
  const whisperInfo = localWhisperService.getBinaryPathWithSource(customWhisperPath);

  // For FFmpeg/FFprobe, check custom path or fallback to bundled path
  // This ensures that if auto-updater updates the bundled binary, we detect it
  const ffmpegPath = settings?.debug?.ffmpegPath || getBinaryPath('ffmpeg');
  const ffprobePath = settings?.debug?.ffprobePath || getBinaryPath('ffprobe');
  const ytDlpPath = getBinaryPath('yt-dlp');
  const qjsPath = getBinaryPath('qjs');
  const alignerPath = customAlignerPath || getBinaryPath('cpp-ort-aligner');

  // Check mtime for both (whether custom or bundled)
  const ffmpegHash = getFileHash(ffmpegPath);
  const ffprobeHash = getFileHash(ffprobePath);
  const ytDlpHash = getFileHash(ytDlpPath);
  const qjsHash = getFileHash(qjsPath);
  const whisperHash = getFileHash(whisperInfo.path);
  const alignerHash = getFileHash(alignerPath);

  // Get commit hash (cached)
  if (!cachedCommitHash) {
    // Check if injected via build process
    if (app.isPackaged && process.env.COMMIT_HASH) {
      cachedCommitHash = process.env.COMMIT_HASH;
    } else {
      const { execSync } = await import('child_process');
      try {
        cachedCommitHash = execSync('git rev-parse --short HEAD', {
          encoding: 'utf-8',
          windowsHide: true,
        }).trim();
      } catch {
        cachedCommitHash = 'N/A';
      }
    }
  }

  // Create hash
  const hash = [
    `v:${pkg.version}`,
    `c:${cachedCommitHash}`,
    `w:${whisperHash}`, // Now includes path + mtime
    `ff:${ffmpegHash}`, // Now includes path + mtime (if custom)
    `fp:${ffprobeHash}`,
    `yd:${ytDlpHash}`,
    `qj:${qjsHash}`,
    `al:${alignerHash}`,
    `p:${process.env.PORTABLE_EXECUTABLE_DIR || 'none'}`,
  ].join('|');

  return {
    hash,
    settings,
    pkg,
    commitHash: cachedCommitHash,
    customWhisperPath,
    customAlignerPath,
  };
}

/**
 * Get system information (versions, GPU status, paths)
 * Uses pre-calculated config to avoid redundant settings reads
 */
async function getSystemInfo(preConfig?: any) {
  const config = preConfig || (await getSystemConfigHash());
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);

  // Get dependency versions
  // These are the "heavy" operations
  const ytDlpInfo = await ytDlpService.getVersions();
  const whisperDetails = await localWhisperService.getWhisperDetails(config.customWhisperPath);
  const whisperVersionStr = `${whisperDetails.version} (${whisperDetails.source}${whisperDetails.gpuSupport ? ' + GPU' : ''})`;

  const alignerVersionRaw = await ctcAlignerService.getVersion(config.customAlignerPath);
  let alignerVersion = alignerVersionRaw;
  if (
    alignerVersionRaw &&
    alignerVersionRaw !== 'Not found' &&
    alignerVersionRaw !== 'Error' &&
    alignerVersionRaw !== 'Unknown'
  ) {
    alignerVersion = `v${alignerVersionRaw}`;
  }

  // Get FFmpeg/FFprobe versions (async to avoid blocking main thread)
  let ffmpegVersion = 'unknown';
  let ffprobeVersion = 'unknown';
  try {
    const ffmpegPath = getBinaryPath('ffmpeg');
    const ffprobePath = getBinaryPath('ffprobe');

    // Run both version checks in parallel
    const [ffmpegResult, ffprobeResult] = await Promise.all([
      execAsync(`"${ffmpegPath}" -version`, { windowsHide: true }).catch(() => ({ stdout: '' })),
      execAsync(`"${ffprobePath}" -version`, { windowsHide: true }).catch(() => ({ stdout: '' })),
    ]);

    const ffmpegMatch = ffmpegResult.stdout.match(/ffmpeg version (.*?) Copyright/);
    if (ffmpegMatch) ffmpegVersion = ffmpegMatch[1].trim();

    const ffprobeMatch = ffprobeResult.stdout.match(/ffprobe version (.*?) Copyright/);
    if (ffprobeMatch) ffprobeVersion = ffprobeMatch[1].trim();
  } catch {
    // FFmpeg not found
  }

  const hwAccelInfo = await videoCompressorService.getHardwareAccelInfo();

  return {
    hash: config.hash,
    appName: config.pkg.productName || config.pkg.name,
    version: config.pkg.version,
    isPackaged: app.isPackaged,
    commitHash: config.commitHash,
    versions: {
      ffmpeg: ffmpegVersion,
      ffprobe: ffprobeVersion,
      ytdlp: ytDlpInfo.ytdlp,
      qjs: ytDlpInfo.qjs,
      whisper: whisperVersionStr,
      aligner: alignerVersion,
      whisperDetails,
    },
    gpu: hwAccelInfo,
    paths: {
      appPath: app.getAppPath(),
      userDataPath: getStorageDir(),
      logPath: getLogDir(),
      exePath: app.getPath('exe'),
      whisperPath: whisperDetails.path,
      alignerPath: config.customAlignerPath || getBinaryPath('cpp-ort-aligner'),
    },
  };
}

// IPC Handler: Get About Information
ipcMain.handle('util:get-about-info', async (_event, lastHash?: string) => {
  try {
    // 1. Calculate current config hash (Previous implementation checks this too late)
    const config = await getSystemConfigHash();

    // 2. Client cache check: If client has same hash, return notModified
    if (lastHash && lastHash === config.hash) {
      return { notModified: true, hash: config.hash };
    }

    // 3. Server cache check: If our cache matches current config, return it
    // This fixes the "loading" issue when client has no cache (first load) but server does (startup)
    if (lastAboutInfo && lastAboutConfigHash === config.hash) {
      return lastAboutInfo;
    }

    // 4. Cache miss: Fetch fresh info
    const info = await getSystemInfo(config);

    // Update cache
    lastAboutInfo = info;
    lastAboutConfigHash = info.hash;

    return info;
  } catch (error: any) {
    console.error('[Main] Failed to get about info:', error);
    throw error;
  }
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
  // Abort local whisper processes immediately
  localWhisperService.abort();
});

// will-quit fires after windows close but before process exits
// This allows analytics to upload while window is already gone
app.on('will-quit', (event) => {
  // Only delay once
  if ((app as any)._analyticsShutdownStarted) return;
  (app as any)._analyticsShutdownStarted = true;

  event.preventDefault();

  // Start analytics shutdown (non-blocking)
  void analyticsService.shutdown().finally(() => {
    // Exit after analytics completes or after timeout (whichever comes first)
    app.exit(0);
  });

  // Safety timeout: force exit after 5 seconds max
  setTimeout(() => {
    app.exit(0);
  }, 5000);
});
