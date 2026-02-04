import electronUpdater from 'electron-updater';
import type { UpdateInfo } from 'electron-updater';
import { type BrowserWindow, ipcMain, shell } from 'electron';
import { isPortableMode, getBinaryPath } from '../utils/paths.ts';
import https from 'https';
import fs from 'fs';
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

// Binary update configuration
const BINARY_REPOS = {
  aligner: { owner: 'Corvo007', repo: 'cpp-ort-aligner' },
  ytdlp: { owner: 'yt-dlp', repo: 'yt-dlp' },
} as const;

type BinaryName = keyof typeof BINARY_REPOS;

export interface BinaryUpdateInfo {
  name: BinaryName;
  current: string;
  latest: string;
  hasUpdate: boolean;
  downloadUrl?: string;
  releaseUrl?: string;
}

export function initUpdateService(window: BrowserWindow) {
  mainWindow = window;

  if (!isPortableMode()) {
    // 安装版：配置 electron-updater
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

  // Binary update handlers
  ipcMain.handle('update:check-binaries', async () => {
    try {
      return { success: true, updates: await checkAllBinaryUpdates() };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle(
    'update:download-binary',
    async (_event, name: BinaryName, downloadUrl: string) => {
      try {
        const result = await downloadBinaryUpdate(name, downloadUrl, (percent) => {
          mainWindow?.webContents.send('update:binary-progress', { name, percent });
        });
        return result;
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }
  );

  ipcMain.handle('update:open-binary-release', (_event, name: BinaryName) => {
    openBinaryReleaseUrl(name);
    return { success: true };
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

// ============================================================================
// Binary Update Functions
// ============================================================================

async function fetchGitHubRelease(
  owner: string,
  repo: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  return new Promise((resolve) => {
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${owner}/${repo}/releases/latest`,
      headers: { 'User-Agent': 'MioSub-Updater' },
      timeout: REQUEST_TIMEOUT_MS,
    };

    const req = https
      .get(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve({ success: true, data: JSON.parse(data) });
          } catch (err: any) {
            resolve({ success: false, error: err.message });
          }
        });
      })
      .on('error', (err) => resolve({ success: false, error: err.message }))
      .on('timeout', () => {
        req.destroy();
        resolve({ success: false, error: 'Request timeout' });
      });
  });
}

async function getCurrentBinaryVersion(name: BinaryName): Promise<string> {
  try {
    if (name === 'aligner') {
      const { ctcAlignerService } = await import('./ctcAligner.ts');
      return await ctcAlignerService.getVersion();
    } else if (name === 'ytdlp') {
      const { ytDlpService } = await import('./ytdlp.ts');
      const versions = await ytDlpService.getVersions();
      return versions.ytdlp;
    }
  } catch (err) {
    console.error(`[UpdateService] Failed to get ${name} version:`, err);
  }
  return 'unknown';
}

function parseAlignerVersion(version: string): string {
  // "cpp-ort-aligner 0.1.2 (582ff15)" -> "0.1.2"
  // "0.1.2" -> "0.1.2"
  const match = version.match(/(\d+\.\d+\.\d+)/);
  return match ? match[1] : version;
}

function parseYtdlpVersion(version: string): string {
  // "2024.12.23" -> "2024.12.23"
  return version.trim();
}

function compareYtdlpVersions(a: string, b: string): number {
  // yt-dlp uses date format: 2024.12.23
  // Compare as strings since they're lexicographically sortable
  if (a > b) return 1;
  if (a < b) return -1;
  return 0;
}

export async function checkBinaryUpdate(name: BinaryName): Promise<BinaryUpdateInfo> {
  const repo = BINARY_REPOS[name];
  const current = await getCurrentBinaryVersion(name);

  const result: BinaryUpdateInfo = {
    name,
    current,
    latest: 'unknown',
    hasUpdate: false,
  };

  const release = await fetchGitHubRelease(repo.owner, repo.repo);
  if (!release.success || !release.data) {
    console.warn(`[UpdateService] Failed to fetch ${name} release:`, release.error);
    return result;
  }

  const tagName = release.data.tag_name || '';
  result.releaseUrl = release.data.html_url;

  if (name === 'aligner') {
    // Aligner: tag is "v0.1.2" or "0.1.2"
    result.latest = tagName.replace(/^v/, '');
    const currentParsed = parseAlignerVersion(current);
    result.hasUpdate = compareVersions(result.latest, currentParsed) > 0;

    // Find Windows binary asset
    const asset = release.data.assets?.find(
      (a: any) => a.name.includes('windows') && a.name.endsWith('.exe')
    );
    if (asset) {
      result.downloadUrl = asset.browser_download_url;
    }
  } else if (name === 'ytdlp') {
    // yt-dlp: tag is "2024.12.23"
    result.latest = tagName;
    const currentParsed = parseYtdlpVersion(current);
    result.hasUpdate = compareYtdlpVersions(result.latest, currentParsed) > 0;

    // Find Windows binary asset
    const asset = release.data.assets?.find((a: any) => a.name === 'yt-dlp.exe');
    if (asset) {
      result.downloadUrl = asset.browser_download_url;
    }
  }

  return result;
}

export async function checkAllBinaryUpdates(): Promise<BinaryUpdateInfo[]> {
  const results = await Promise.all([checkBinaryUpdate('aligner'), checkBinaryUpdate('ytdlp')]);
  return results;
}

export async function downloadBinaryUpdate(
  name: BinaryName,
  downloadUrl: string,
  onProgress?: (percent: number) => void
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const binaryPath = getBinaryPath(name === 'aligner' ? 'cpp-ort-aligner' : 'yt-dlp');
    const tempPath = `${binaryPath}.tmp`;
    const backupPath = `${binaryPath}.bak`;

    console.log(`[UpdateService] Downloading ${name} from ${downloadUrl}`);
    console.log(`[UpdateService] Target path: ${binaryPath}`);

    // Follow redirects for GitHub releases
    const download = (url: string, redirectCount = 0) => {
      if (redirectCount > 5) {
        resolve({ success: false, error: 'Too many redirects' });
        return;
      }

      const urlObj = new URL(url);
      const options = {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        headers: { 'User-Agent': 'MioSub-Updater' },
        timeout: 60000, // 60s for download
      };

      const req = https
        .get(options, (res) => {
          // Handle redirects
          if (res.statusCode === 301 || res.statusCode === 302) {
            const location = res.headers.location;
            if (location) {
              download(location, redirectCount + 1);
              return;
            }
          }

          if (res.statusCode !== 200) {
            resolve({ success: false, error: `HTTP ${res.statusCode}` });
            return;
          }

          const totalSize = parseInt(res.headers['content-length'] || '0', 10);
          let downloadedSize = 0;

          const fileStream = fs.createWriteStream(tempPath);

          res.on('data', (chunk) => {
            downloadedSize += chunk.length;
            if (totalSize > 0 && onProgress) {
              onProgress((downloadedSize / totalSize) * 100);
            }
          });

          res.pipe(fileStream);

          fileStream.on('finish', () => {
            fileStream.close();

            try {
              // Backup existing file
              if (fs.existsSync(binaryPath)) {
                if (fs.existsSync(backupPath)) {
                  fs.unlinkSync(backupPath);
                }
                fs.renameSync(binaryPath, backupPath);
              }

              // Move temp to target
              fs.renameSync(tempPath, binaryPath);

              // Clean up backup on success
              if (fs.existsSync(backupPath)) {
                fs.unlinkSync(backupPath);
              }

              console.log(`[UpdateService] Successfully updated ${name}`);
              resolve({ success: true });
            } catch (err: any) {
              // Restore backup on failure
              if (fs.existsSync(backupPath) && !fs.existsSync(binaryPath)) {
                fs.renameSync(backupPath, binaryPath);
              }
              resolve({ success: false, error: err.message });
            }
          });

          fileStream.on('error', (err) => {
            fs.unlink(tempPath, () => {});
            resolve({ success: false, error: err.message });
          });
        })
        .on('error', (err) => {
          resolve({ success: false, error: err.message });
        })
        .on('timeout', () => {
          req.destroy();
          resolve({ success: false, error: 'Download timeout' });
        });
    };

    download(downloadUrl);
  });
}

export function openBinaryReleaseUrl(name: BinaryName): void {
  const repo = BINARY_REPOS[name];
  const url = `https://github.com/${repo.owner}/${repo.repo}/releases/latest`;
  shell.openExternal(url);
}
