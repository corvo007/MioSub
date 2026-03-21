import { ipcMain } from 'electron';
import type { BrowserWindow } from 'electron';
import { isPortableMode } from '../../utils/paths.ts';
import type { BinaryName, UpdateState } from './types.ts';
import { fetchGitHubReleaseByTag } from './githubApi.ts';
import { extractChangelog } from './changelogParser.ts';

export interface UpdateIpcDeps {
  autoUpdater: any;
  getMainWindow: () => BrowserWindow | null;
  sendUpdateStatus: () => void;
  setUpdateState: (partial: Partial<UpdateState>) => void;
  getUpdateStatusPayload: () => Record<string, unknown>;
  checkGitHubRelease: () => Promise<any>;
  checkAllBinaryUpdates: (whisperCustomBinaryPath?: string) => Promise<any>;
  downloadBinaryUpdate: (
    name: BinaryName,
    url: string,
    onProgress?: (p: number) => void
  ) => Promise<{ success: boolean; error?: string }>;
  openBinaryReleaseUrl: (name: BinaryName) => void;
}

let registered = false;

export function registerUpdateIpcHandlers(deps: UpdateIpcDeps) {
  if (registered) return;
  registered = true;

  const {
    autoUpdater,
    getMainWindow,
    sendUpdateStatus,
    setUpdateState,
    getUpdateStatusPayload,
    checkGitHubRelease,
    checkAllBinaryUpdates,
    downloadBinaryUpdate,
    openBinaryReleaseUrl,
  } = deps;

  ipcMain.handle('update:check', async () => {
    if (isPortableMode()) {
      return checkGitHubRelease();
    } else {
      try {
        setUpdateState({ status: 'checking', error: null });
        sendUpdateStatus();
        const result = await autoUpdater.checkForUpdates();
        return { success: true, version: result?.updateInfo.version };
      } catch (err: any) {
        setUpdateState({ status: 'error', error: err.message });
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
      setUpdateState({ status: 'downloading', progress: 0 });
      sendUpdateStatus();
      await autoUpdater.downloadUpdate();
      return { success: true };
    } catch (err: any) {
      setUpdateState({ status: 'error', error: err.message });
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
    return getUpdateStatusPayload();
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
          const win = getMainWindow();
          if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return;
          win.webContents.send('update:binary-progress', { name, percent });
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

  // Changelog handler
  ipcMain.handle(
    'changelog:fetch',
    async (_event, payload?: { version?: string; language?: string }) => {
      try {
        const version = typeof payload?.version === 'string' ? payload.version : '';
        const language = typeof payload?.language === 'string' ? payload.language : 'en-US';
        if (!version) return { success: false, error: 'Invalid version' };
        const tag = version.startsWith('v') ? version : `v${version}`;
        const result = await fetchGitHubReleaseByTag('corvo007', 'Gemini-Subtitle-Pro', tag);
        if (!result.success || !result.data?.body) {
          return { success: false, error: result.error || 'No release body found' };
        }
        const changelog = extractChangelog(result.data.body, language);
        return { success: true, changelog, version };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }
  );
}
