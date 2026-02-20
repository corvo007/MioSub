import electronUpdater from 'electron-updater';
import type { UpdateInfo } from 'electron-updater';
import { type BrowserWindow, ipcMain, shell } from 'electron';
import { isPortableMode, getBinaryPath } from '../utils/paths.ts';
import { compareVersions, isRealVersion } from '../utils/version.ts';
import * as Sentry from '@sentry/electron/main';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { execFileSync, spawn } from 'child_process';
import pkg from '../../package.json' with { type: 'json' };

const { autoUpdater } = electronUpdater;

// Configure electron-updater logger to filter out verbose DEBUG logs
// This prevents massive blockmap JSON arrays from flooding the log file
// (blockmap logs can be thousands of lines with start/end ranges for each block)
autoUpdater.logger = {
  info: (message: string) => console.log(`[electron-updater] ${message}`),
  warn: (message: string) => console.warn(`[electron-updater] ${message}`),
  error: (message: string) => console.error(`[electron-updater] ${message}`),
  debug: (message: string) => {
    // Filter out verbose blockmap-related logs
    // These logs contain huge JSON arrays with block ranges like {"start":0,"end":1234}
    if (
      typeof message === 'string' &&
      (message.includes('"start"') || message.includes('"end"') || message.length > 500)
    ) {
      return; // Skip verbose blockmap operation logs
    }
    console.debug(`[electron-updater] ${message}`);
  },
};

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
const GITHUB_REPO = 'MioSub';
const REQUEST_TIMEOUT_MS = 15000; // 15 seconds timeout for GitHub API

// Binary update configuration
const BINARY_REPOS = {
  aligner: { owner: 'Corvo007', repo: 'cpp-ctc-aligner' },
  ytdlp: { owner: 'yt-dlp', repo: 'yt-dlp' },
  whisper: { owner: 'Corvo007', repo: 'whisper.cpp' },
} as const;

type BinaryName = keyof typeof BINARY_REPOS;

// Companion libraries that must be installed alongside the main binary.
// Mirrors REQUIRED_FILES from scripts/binary-config.mjs (minus the main binary itself).
const BINARY_COMPANIONS: Record<string, Record<string, string[]>> = {
  'cpp-ort-aligner': {
    'win32-x64': ['onnxruntime.dll'],
    'linux-x64': ['libonnxruntime.so'],
    'linux-arm64': ['libonnxruntime.so'],
    'darwin-x64': ['libonnxruntime.dylib'],
    'darwin-arm64': ['libonnxruntime.dylib'],
  },
};

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
      console.error('[UpdateService] Auto-updater error:', err.message);
      updateState = { ...updateState, status: 'error', error: err.message };
      sendUpdateStatus();
    });

    // 安装版启动后自动检测更新（延迟 3 秒）
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((err) => {
        console.error('[UpdateService] Check for updates failed:', err.message);
      });
    }, 3000);
  }

  // 注册 IPC 处理器
  registerIpcHandlers();
}

function sendUpdateStatus() {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send('update:status', {
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
  ipcMain.handle(
    'update:check-binaries',
    async (_event, options?: { whisperCustomBinaryPath?: string }) => {
      try {
        return {
          success: true,
          updates: await checkAllBinaryUpdates(options?.whisperCustomBinaryPath),
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }
  );

  ipcMain.handle(
    'update:download-binary',
    async (_event, name: BinaryName, downloadUrl: string) => {
      try {
        const result = await downloadBinaryUpdate(name, downloadUrl, (percent) => {
          if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) {
            return;
          }
          mainWindow.webContents.send('update:binary-progress', { name, percent });
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

// ============================================================================
// Binary Update Functions
// ============================================================================

async function fetchGitHubRelease(
  owner: string,
  repo: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  return new Promise((resolve) => {
    const doGet = (url: string, redirects = 0) => {
      if (redirects > 5) {
        resolve({ success: false, error: 'Too many redirects' });
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
                resolve({
                  success: false,
                  error: `GitHub API ${res.statusCode}: ${data.slice(0, 200)}`,
                });
                return;
              }
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
    };
    doGet(`https://api.github.com/repos/${owner}/${repo}/releases/latest`);
  });
}

async function getCurrentBinaryVersion(
  name: BinaryName,
  whisperCustomBinaryPath?: string
): Promise<string> {
  try {
    if (name === 'aligner') {
      const { ctcAlignerService } = await import('./ctcAligner.ts');
      return await ctcAlignerService.getVersion();
    } else if (name === 'ytdlp') {
      const { ytDlpService } = await import('./ytdlp.ts');
      const versions = await ytDlpService.getVersions();
      return versions.ytdlp;
    } else if (name === 'whisper') {
      const { localWhisperService } = await import('./localWhisper.ts');
      const details = await localWhisperService.getWhisperDetails(whisperCustomBinaryPath);
      if (details.source === 'Custom') return 'custom';
      return details.version.replace(/^v/, '');
    }
  } catch (err) {
    console.error(`[UpdateService] Failed to get ${name} version:`, err);
    Sentry.captureException(err, { tags: { action: 'get-binary-version', binary: name } });
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

export async function checkBinaryUpdate(
  name: BinaryName,
  whisperCustomBinaryPath?: string
): Promise<BinaryUpdateInfo> {
  const repo = BINARY_REPOS[name];
  const current = await getCurrentBinaryVersion(name, whisperCustomBinaryPath);

  // Skip update check for custom (third-party) binaries
  if (current === 'custom') {
    return { name, current: 'custom', latest: '', hasUpdate: false };
  }

  const result: BinaryUpdateInfo = {
    name,
    current,
    latest: 'unknown',
    hasUpdate: false,
  };

  try {
    const release = await fetchGitHubRelease(repo.owner, repo.repo);
    if (!release.success || !release.data) {
      console.warn(`[UpdateService] Failed to fetch ${name} release:`, release.error);
      return result;
    }

    const tagName = release.data.tag_name || '';
    result.releaseUrl = release.data.html_url;

    const platform = process.platform; // 'win32' | 'darwin' | 'linux'
    const arch = process.arch; // 'x64' | 'arm64' | 'ia32'

    if (name === 'aligner') {
      // Aligner: tag is "v0.1.2" or "0.1.2"
      result.latest = tagName.replace(/^v/, '');
      const currentParsed = parseAlignerVersion(current);
      if (!isRealVersion(currentParsed)) {
        result.hasUpdate = true;
      } else {
        result.hasUpdate = compareVersions(result.latest, currentParsed) > 0;
      }

      // Force update if companion libraries are missing (e.g. onnxruntime.dll)
      if (!result.hasUpdate) {
        const binPath = getBinaryPath('cpp-ort-aligner');
        const platformKey = `${process.platform}-${process.arch}`;
        const companions = BINARY_COMPANIONS['cpp-ort-aligner']?.[platformKey] || [];
        for (const lib of companions) {
          if (!fs.existsSync(path.join(path.dirname(binPath), lib))) {
            result.hasUpdate = true;
            break;
          }
        }
      }

      // Find platform and arch specific binary asset
      // Naming: cpp-ort-aligner-{platform}-{arch}.{zip|tar.gz}
      // Exclude -symbols files
      const asset = release.data.assets?.find((a: any) => {
        const assetName = a.name.toLowerCase();
        // Skip symbol files
        if (assetName.includes('-symbols')) return false;

        if (platform === 'win32') {
          // Windows: .zip format
          if (
            arch === 'arm64' &&
            assetName.includes('windows-arm64') &&
            assetName.endsWith('.zip')
          ) {
            return true;
          }
          // Default to x64 for Windows
          return assetName.includes('windows-x64') && assetName.endsWith('.zip');
        } else if (platform === 'darwin') {
          // macOS: universal2 .tar.gz (supports both x64 and arm64)
          return assetName.includes('macos-universal2') && assetName.endsWith('.tar.gz');
        } else if (platform === 'linux') {
          // Linux: .tar.gz format
          if (
            arch === 'arm64' &&
            assetName.includes('linux-arm64') &&
            assetName.endsWith('.tar.gz')
          ) {
            return true;
          }
          return assetName.includes('linux-x64') && assetName.endsWith('.tar.gz');
        }
        return false;
      });
      if (asset) {
        result.downloadUrl = asset.browser_download_url;
      }
    } else if (name === 'ytdlp') {
      // yt-dlp: tag is "2024.12.23"
      result.latest = tagName;
      const currentParsed = parseYtdlpVersion(current);
      if (!isRealVersion(currentParsed)) {
        result.hasUpdate = true;
      } else {
        result.hasUpdate = compareYtdlpVersions(result.latest, currentParsed) > 0;
      }

      // Find platform-specific binary asset
      // yt-dlp naming: yt-dlp.exe (Windows), yt-dlp_macos (macOS universal), yt-dlp_linux (Linux)
      // Note: yt-dlp provides universal binaries for macOS that work on both Intel and Apple Silicon
      const asset = release.data.assets?.find((a: any) => {
        const assetName = a.name;
        if (platform === 'win32') {
          // Windows: yt-dlp.exe or yt-dlp_win.exe
          return assetName === 'yt-dlp.exe' || assetName === 'yt-dlp_win.exe';
        } else if (platform === 'darwin') {
          // macOS: yt-dlp_macos (universal binary)
          return assetName === 'yt-dlp_macos';
        } else if (platform === 'linux') {
          // Linux: yt-dlp_linux or yt-dlp_linux_aarch64 for arm64
          if (arch === 'arm64') {
            return assetName === 'yt-dlp_linux_aarch64';
          }
          return assetName === 'yt-dlp_linux';
        }
        return false;
      });
      if (asset) {
        result.downloadUrl = asset.browser_download_url;
      }
    } else if (name === 'whisper') {
      // whisper.cpp: tag is "v1.8.5-custom"
      const latestVersion = tagName.replace(/^v/, '').replace(/-custom$/, '');
      result.latest = latestVersion;

      if (!isRealVersion(current)) {
        result.hasUpdate = true;
      } else {
        result.hasUpdate = compareVersions(latestVersion, current) > 0;
      }

      // Asset naming: whisper-windows-x86_64.zip, whisper-macos-arm64.tar.gz, etc.
      const asset = release.data.assets?.find((a: any) => {
        const n = a.name.toLowerCase();
        if (platform === 'win32') {
          return n.includes('windows') && n.includes('x86_64') && n.endsWith('.zip');
        } else if (platform === 'darwin') {
          if (arch === 'arm64')
            return n.includes('macos') && n.includes('arm64') && n.endsWith('.tar.gz');
          return n.includes('macos') && n.includes('x86_64') && n.endsWith('.tar.gz');
        } else if (platform === 'linux') {
          if (arch === 'arm64')
            return n.includes('linux') && n.includes('arm64') && n.endsWith('.tar.gz');
          return n.includes('linux') && n.includes('x86_64') && n.endsWith('.tar.gz');
        }
        return false;
      });
      if (asset) {
        result.downloadUrl = asset.browser_download_url;
      }
    }
  } catch (err: any) {
    console.warn(`[UpdateService] Version comparison failed for ${name}:`, err.message);
    Sentry.captureException(err, { tags: { action: 'version-comparison', binary: name } });
  }

  return result;
}

export async function checkAllBinaryUpdates(
  whisperCustomBinaryPath?: string
): Promise<BinaryUpdateInfo[]> {
  const results = await Promise.all([
    checkBinaryUpdate('aligner'),
    checkBinaryUpdate('ytdlp'),
    checkBinaryUpdate('whisper', whisperCustomBinaryPath),
  ]);
  return results;
}

export async function downloadBinaryUpdate(
  name: BinaryName,
  downloadUrl: string,
  onProgress?: (percent: number) => void
): Promise<{ success: boolean; error?: string }> {
  // Security: Validate download URL is from GitHub
  try {
    const urlObj = new URL(downloadUrl);
    const allowedHosts = ['github.com', 'objects.githubusercontent.com'];
    if (!allowedHosts.some((host) => urlObj.hostname.endsWith(host))) {
      return { success: false, error: 'Invalid download URL: must be from GitHub' };
    }
  } catch {
    return { success: false, error: 'Invalid download URL format' };
  }

  const binaryNameMap: Record<BinaryName, string> = {
    aligner: 'cpp-ort-aligner',
    ytdlp: 'yt-dlp',
    whisper: 'whisper-cli',
  };
  const binaryName = binaryNameMap[name];
  const binaryPath = getBinaryPath(binaryName);
  const resourceDir = path.dirname(binaryPath);
  const isArchive = downloadUrl.endsWith('.zip') || downloadUrl.endsWith('.tar.gz');
  const archiveExt = downloadUrl.endsWith('.zip') ? '.zip' : '.tar.gz';
  const tempArchivePath = path.join(resourceDir, `${binaryName}-update${archiveExt}`);
  const tempExtractDir = path.join(resourceDir, `${binaryName}-update-temp`);
  const backupPath = `${binaryPath}.bak`;

  console.log(`[UpdateService] Downloading ${name} from ${downloadUrl}`);
  console.log(`[UpdateService] Target path: ${binaryPath}`);
  console.log(`[UpdateService] Is archive: ${isArchive}`);

  // Helper to clean up temp files
  const cleanup = () => {
    try {
      if (fs.existsSync(tempArchivePath)) fs.unlinkSync(tempArchivePath);
      if (fs.existsSync(tempExtractDir)) fs.rmSync(tempExtractDir, { recursive: true });
    } catch (e) {
      console.warn('[UpdateService] Cleanup failed:', e);
    }
  };

  // Download file
  const downloadFile = (targetPath: string): Promise<{ success: boolean; error?: string }> => {
    return new Promise((resolve) => {
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
          timeout: 120000, // 2 min for download
        };

        const req = https
          .get(options, (res) => {
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

            const fileStream = fs.createWriteStream(targetPath);

            res.on('data', (chunk) => {
              downloadedSize += chunk.length;
              if (totalSize > 0 && onProgress) {
                // Reserve last 10% for extraction
                onProgress((downloadedSize / totalSize) * (isArchive ? 90 : 100));
              }
            });

            res.pipe(fileStream);

            // Handle response errors during pipe
            res.on('error', (err) => {
              fileStream.destroy();
              resolve({ success: false, error: err.message });
            });

            fileStream.on('finish', () => {
              fileStream.close();
              resolve({ success: true });
            });

            fileStream.on('error', (err) => {
              fileStream.destroy();
              fs.unlink(targetPath, () => {}); // Clean up partial file
              resolve({ success: false, error: err.message });
            });
          })
          .on('error', (err) => resolve({ success: false, error: err.message }))
          .on('timeout', () => {
            req.destroy();
            resolve({ success: false, error: 'Download timeout' });
          });
      };

      download(downloadUrl);
    });
  };

  // Extract archive
  const extractArchive = async (): Promise<{ success: boolean; error?: string }> => {
    // Create temp extract directory
    if (fs.existsSync(tempExtractDir)) {
      fs.rmSync(tempExtractDir, { recursive: true });
    }
    fs.mkdirSync(tempExtractDir, { recursive: true });

    if (archiveExt === '.zip') {
      // Use PowerShell on Windows, unzip on Unix
      return new Promise((resolve) => {
        const cmd =
          process.platform === 'win32'
            ? spawn('powershell', [
                '-NoProfile',
                '-Command',
                `Expand-Archive -Path "${tempArchivePath}" -DestinationPath "${tempExtractDir}" -Force`,
              ])
            : spawn('unzip', ['-o', tempArchivePath, '-d', tempExtractDir]);

        cmd.on('close', (code) => {
          if (code === 0) {
            resolve({ success: true });
          } else {
            resolve({ success: false, error: `Unzip failed with code ${code}` });
          }
        });
        cmd.on('error', (err) => resolve({ success: false, error: err.message }));
      });
    } else {
      // .tar.gz - use tar command
      return new Promise((resolve) => {
        const cmd = spawn('tar', ['-xzf', tempArchivePath, '-C', tempExtractDir]);

        cmd.on('close', (code) => {
          if (code === 0) {
            resolve({ success: true });
          } else {
            resolve({ success: false, error: `Tar extract failed with code ${code}` });
          }
        });
        cmd.on('error', (err) => resolve({ success: false, error: err.message }));
      });
    }
  };

  // Find and move binary + companion libraries from extracted files
  const installBinary = (): { success: boolean; error?: string } => {
    const companionBackups: Array<{ filePath: string; backupPath: string }> = [];

    // Recursively find a file by exact name in a directory tree
    const findFileByName = (dir: string, fileName: string): string | null => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          const found = findFileByName(fullPath, fileName);
          if (found) return found;
        } else if (entry.isFile() && entry.name === fileName) {
          return fullPath;
        }
      }
      return null;
    };

    try {
      // Find the main binary in extracted directory (may be in subdirectory)
      const binaryFileName = process.platform === 'win32' ? `${binaryName}.exe` : binaryName;
      const extractedBinary = findFileByName(tempExtractDir, binaryFileName);
      if (!extractedBinary) {
        return { success: false, error: `Binary ${binaryName} not found in archive` };
      }

      // Resolve companion files for this binary + platform
      const platformKey = `${process.platform}-${process.arch}`;
      const companions = BINARY_COMPANIONS[binaryName]?.[platformKey] || [];

      // --- Backup phase (main binary + companions) ---
      if (fs.existsSync(binaryPath)) {
        if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);
        fs.renameSync(binaryPath, backupPath);
      }
      for (const comp of companions) {
        const compPath = path.join(resourceDir, comp);
        const compBackup = `${compPath}.bak`;
        if (fs.existsSync(compPath)) {
          if (fs.existsSync(compBackup)) fs.unlinkSync(compBackup);
          fs.renameSync(compPath, compBackup);
          companionBackups.push({ filePath: compPath, backupPath: compBackup });
        }
      }

      // --- Install phase (main binary) ---
      fs.copyFileSync(extractedBinary, binaryPath);
      if (process.platform !== 'win32') {
        fs.chmodSync(binaryPath, 0o755);
      }

      // --- Install phase (companion libraries) ---
      for (const comp of companions) {
        const compSrc = findFileByName(tempExtractDir, comp);
        if (compSrc) {
          const compDst = path.join(resourceDir, comp);
          fs.copyFileSync(compSrc, compDst);
          if (process.platform !== 'win32') {
            fs.chmodSync(compDst, 0o755);
          }
          // Re-sign on macOS to prevent KERN_CODESIGN_ERROR
          if (process.platform === 'darwin') {
            try {
              execFileSync('codesign', ['--force', '-s', '-', compDst]);
            } catch (e) {
              console.warn(`[UpdateService] Ad-hoc codesign failed for ${comp}:`, e);
              Sentry.captureException(e, { tags: { action: 'codesign', binary: comp } });
            }
          }
          console.log(`[UpdateService] Installed companion: ${comp}`);
        }
      }

      // --- Cleanup backups on success ---
      if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);
      for (const { backupPath: bp } of companionBackups) {
        if (fs.existsSync(bp)) fs.unlinkSync(bp);
      }

      return { success: true };
    } catch (err: any) {
      // Restore all backups on failure (main binary + companions)
      if (fs.existsSync(backupPath)) {
        try {
          if (fs.existsSync(binaryPath)) fs.unlinkSync(binaryPath);
        } catch {
          /* best-effort cleanup */
        }
        try {
          fs.renameSync(backupPath, binaryPath);
        } catch {
          /* best-effort cleanup */
        }
      }
      for (const { filePath: fp, backupPath: bp } of companionBackups) {
        try {
          if (fs.existsSync(fp)) fs.unlinkSync(fp);
        } catch {
          /* best-effort cleanup */
        }
        try {
          if (fs.existsSync(bp)) fs.renameSync(bp, fp);
        } catch {
          /* best-effort cleanup */
        }
      }
      return { success: false, error: err.message };
    }
  };

  try {
    // Step 1: Download
    const targetPath = isArchive ? tempArchivePath : `${binaryPath}.tmp`;
    const downloadResult = await downloadFile(targetPath);
    if (!downloadResult.success) {
      cleanup();
      return downloadResult;
    }

    if (isArchive) {
      // Step 2: Extract
      onProgress?.(92);
      const extractResult = await extractArchive();
      if (!extractResult.success) {
        cleanup();
        return extractResult;
      }

      // Step 3: Install
      onProgress?.(96);
      const installResult = installBinary();
      cleanup();

      if (installResult.success) {
        onProgress?.(100);
        console.log(`[UpdateService] Successfully updated ${name}`);
      }
      return installResult;
    } else {
      // Direct binary (yt-dlp)
      try {
        // Backup existing file
        if (fs.existsSync(binaryPath)) {
          if (fs.existsSync(backupPath)) {
            fs.unlinkSync(backupPath);
          }
          fs.renameSync(binaryPath, backupPath);
        }

        // Move temp to target
        fs.renameSync(targetPath, binaryPath);

        // Set executable permission on Unix-like systems
        if (process.platform !== 'win32') {
          fs.chmodSync(binaryPath, 0o755);
        }

        // Clean up backup
        if (fs.existsSync(backupPath)) {
          fs.unlinkSync(backupPath);
        }

        onProgress?.(100);
        console.log(`[UpdateService] Successfully updated ${name}`);
        return { success: true };
      } catch (err: any) {
        // Restore backup on failure
        if (fs.existsSync(backupPath) && !fs.existsSync(binaryPath)) {
          fs.renameSync(backupPath, binaryPath);
        }
        return { success: false, error: err.message };
      }
    }
  } catch (err: any) {
    cleanup();
    return { success: false, error: err.message };
  }
}

export function openBinaryReleaseUrl(name: BinaryName): void {
  const repo = BINARY_REPOS[name];
  const url = `https://github.com/${repo.owner}/${repo.repo}/releases/latest`;
  void shell.openExternal(url);
}
