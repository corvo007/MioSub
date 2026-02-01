import electronUpdater from 'electron-updater';
import type { UpdateInfo } from 'electron-updater';
import { type BrowserWindow, ipcMain } from 'electron';
import { isPortableMode } from '../utils/paths.ts';
import https from 'https';
import pkg from '../../package.json' with { type: 'json' };

const { autoUpdater } = electronUpdater;

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error';

interface UpdateState {
  status: UpdateStatus;
  info: UpdateInfo | null;
  error: string | null;
  progress: number;
}

let mainWindow: BrowserWindow | null = null;
let updateState: UpdateState = {
  status: 'idle',
  info: null,
  error: null,
  progress: 0,
};
let ipcHandlersRegistered = false;

const GITHUB_OWNER = 'Corvo007';
const GITHUB_REPO = 'Gemini-Subtitle-Pro';
const REQUEST_TIMEOUT_MS = 15000; // 15 seconds timeout for GitHub API

export function initUpdateService(window: BrowserWindow) {
  mainWindow = window;

  if (!isPortableMode()) {
    // 安装版：配置 electron-updater
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('checking-for-update', () => {
      updateState = { ...updateState, status: 'checking', error: null };
      sendUpdateStatus();
    });

    autoUpdater.on('update-available', (info) => {
      updateState = { ...updateState, status: 'available', info };
      sendUpdateStatus();
    });

    autoUpdater.on('update-not-available', (info) => {
      updateState = { ...updateState, status: 'not-available', info };
      sendUpdateStatus();
    });

    autoUpdater.on('download-progress', (progress) => {
      updateState = { ...updateState, status: 'downloading', progress: progress.percent };
      sendUpdateStatus();
    });

    autoUpdater.on('update-downloaded', (info) => {
      updateState = { ...updateState, status: 'downloaded', info, progress: 100 };
      sendUpdateStatus();
    });

    autoUpdater.on('error', (err) => {
      updateState = { ...updateState, status: 'error', error: err.message };
      sendUpdateStatus();
    });

    // 安装版启动后自动检测更新（延迟 3 秒）
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(() => {
        // 静默失败，不影响用户体验
      });
    }, 3000);
  }

  // 注册 IPC 处理器
  registerIpcHandlers();
}

function sendUpdateStatus() {
  mainWindow?.webContents.send('update:status', {
    status: updateState.status,
    version: updateState.info?.version || null,
    error: updateState.error,
    progress: updateState.progress,
    isPortable: isPortableMode(),
  });
}

function registerIpcHandlers() {
  if (ipcHandlersRegistered) return;
  ipcHandlersRegistered = true;

  ipcMain.handle('update:check', async () => {
    if (isPortableMode()) {
      return checkGitHubRelease();
    } else {
      try {
        updateState = { ...updateState, status: 'checking', error: null };
        sendUpdateStatus();
        const result = await autoUpdater.checkForUpdates();
        return { success: true, version: result?.updateInfo.version };
      } catch (err: any) {
        updateState = { ...updateState, status: 'error', error: err.message };
        sendUpdateStatus();
        return { success: false, error: err.message };
      }
    }
  });

  ipcMain.handle('update:download', async () => {
    if (isPortableMode()) {
      return { success: false, error: 'Portable mode does not support auto-download' };
    }
    try {
      updateState = { ...updateState, status: 'downloading', progress: 0 };
      sendUpdateStatus();
      await autoUpdater.downloadUpdate();
      return { success: true };
    } catch (err: any) {
      updateState = { ...updateState, status: 'error', error: err.message };
      sendUpdateStatus();
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('update:install', () => {
    if (isPortableMode()) {
      return { success: false, error: 'Portable mode does not support auto-install' };
    }
    autoUpdater.quitAndInstall(false, true);
    return { success: true };
  });

  ipcMain.handle('update:get-status', () => {
    return {
      status: updateState.status,
      version: updateState.info?.version || null,
      error: updateState.error,
      progress: updateState.progress,
      isPortable: isPortableMode(),
    };
  });
}

async function checkGitHubRelease(): Promise<{
  success: boolean;
  hasUpdate?: boolean;
  version?: string;
  downloadUrl?: string;
  error?: string;
}> {
  return new Promise((resolve) => {
    updateState = { ...updateState, status: 'checking', error: null };
    sendUpdateStatus();

    const options = {
      hostname: 'api.github.com',
      path: `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
      headers: { 'User-Agent': 'MioSub-Updater' },
      timeout: REQUEST_TIMEOUT_MS,
    };

    const handleError = (errorMsg: string) => {
      updateState = { ...updateState, status: 'error', error: errorMsg };
      sendUpdateStatus();
      resolve({ success: false, error: errorMsg });
    };

    const req = https
      .get(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const release = JSON.parse(data);
            const latestVersion = release.tag_name?.replace(/^v/, '') || '';
            const currentVersion = pkg.version;
            const hasUpdate = compareVersions(latestVersion, currentVersion) > 0;

            // 查找 ZIP 下载链接
            const zipAsset = release.assets?.find(
              (a: any) => a.name.endsWith('.zip') && a.name.includes('win')
            );

            updateState = {
              status: hasUpdate ? 'available' : 'not-available',
              info: { version: latestVersion } as UpdateInfo,
              error: null,
              progress: 0,
            };
            sendUpdateStatus();

            resolve({
              success: true,
              hasUpdate,
              version: latestVersion,
              downloadUrl: zipAsset?.browser_download_url || release.html_url,
            });
          } catch (err: any) {
            handleError(err.message);
          }
        });
      })
      .on('error', (err) => {
        handleError(err.message);
      })
      .on('timeout', () => {
        req.destroy();
        handleError('Request timeout');
      });
  });
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}
