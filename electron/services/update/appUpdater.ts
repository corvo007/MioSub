import electronUpdater from 'electron-updater';
import type { UpdateInfo } from 'electron-updater';
import type { BrowserWindow } from 'electron';
import https from 'https';
import { isPortableMode } from '../../utils/paths.ts';
import { compareVersions } from '../../utils/version.ts';
import pkg from '../../../package.json' with { type: 'json' };
import type { UpdateState } from './types.ts';
import { REQUEST_TIMEOUT_MS } from './githubApi.ts';

export const { autoUpdater } = electronUpdater;

// Configure electron-updater logger to filter out verbose DEBUG logs
// This prevents massive blockmap JSON arrays from flooding the log file
// (blockmap logs can be thousands of lines with start/end ranges for each block)
autoUpdater.logger = {
  info: (message: string) => console.log(`[electron-updater] ${message}`),
  warn: (message: string) => console.warn(`[electron-updater] ${message}`),
  error: (message: string) => console.error(`[electron-updater] ${message}`),
  debug: (message: string) => {
    // Filter out verbose blockmap-related logs
    if (
      typeof message === 'string' &&
      (message.includes('"start"') || message.includes('"end"') || message.length > 500)
    ) {
      return;
    }
    console.debug(`[electron-updater] ${message}`);
  },
};

const GITHUB_OWNER = 'Corvo007';
const GITHUB_REPO = 'MioSub';

let mainWindow: BrowserWindow | null = null;
let updateState: UpdateState = {
  status: 'idle',
  info: null,
  error: null,
  progress: 0,
};

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

export function getUpdateStatusPayload() {
  return {
    status: updateState.status,
    version: updateState.info?.version || null,
    error: updateState.error,
    progress: updateState.progress,
    isPortable: isPortableMode(),
  };
}

export function setUpdateState(partial: Partial<UpdateState>) {
  updateState = { ...updateState, ...partial };
}

export function sendUpdateStatus() {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send('update:status', getUpdateStatusPayload());
}

export function initAppUpdater(window: BrowserWindow) {
  mainWindow = window;

  if (!isPortableMode()) {
    autoUpdater.autoDownload = true;
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
      console.error('[UpdateService] Auto-updater error:', err.message);
      updateState = { ...updateState, status: 'error', error: err.message };
      sendUpdateStatus();
    });

    // Auto-check after 3 seconds
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((err) => {
        console.error('[UpdateService] Check for updates failed:', err.message);
      });
    }, 3000);
  }
}

/**
 * Check for app updates via GitHub Release API (portable mode only).
 */
export async function checkGitHubRelease(): Promise<{
  success: boolean;
  hasUpdate?: boolean;
  version?: string;
  downloadUrl?: string;
  error?: string;
}> {
  return new Promise((resolve) => {
    updateState = { ...updateState, status: 'checking', error: null };
    sendUpdateStatus();

    const handleError = (errorMsg: string) => {
      console.error('[UpdateService] App update check failed:', errorMsg);
      updateState = { ...updateState, status: 'error', error: errorMsg };
      sendUpdateStatus();
      resolve({ success: false, error: errorMsg });
    };

    const doGet = (url: string, redirects = 0) => {
      if (redirects > 5) {
        handleError('Too many redirects');
        return;
      }
      const urlObj = new URL(url);
      const opts = {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        headers: { 'User-Agent': 'MioSub-Updater' },
        timeout: REQUEST_TIMEOUT_MS,
      };
      const req = https
        .get(opts, (res) => {
          if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
            doGet(res.headers.location, redirects + 1);
            return;
          }
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            try {
              if (res.statusCode !== 200) {
                handleError(`GitHub API ${res.statusCode}: ${data.slice(0, 200)}`);
                return;
              }
              const release = JSON.parse(data);
              const latestVersion = release.tag_name?.replace(/^v/, '') || '';
              const currentVersion = pkg.version;
              const hasUpdate = compareVersions(latestVersion, currentVersion) > 0;

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
        .on('error', (err) => handleError(err.message))
        .on('timeout', () => {
          req.destroy();
          handleError('Request timeout');
        });
    };
    doGet(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`);
  });
}
