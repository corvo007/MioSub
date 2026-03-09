import type { BrowserWindow } from 'electron';
import {
  initAppUpdater,
  autoUpdater,
  getMainWindow,
  sendUpdateStatus,
  setUpdateState,
  getUpdateStatusPayload,
  checkGitHubRelease,
} from './appUpdater.ts';
import { checkAllBinaryUpdates } from './binaryVersionChecker.ts';
import { downloadBinaryUpdate, openBinaryReleaseUrl } from './binaryInstaller.ts';
import { registerUpdateIpcHandlers } from './ipcHandlers.ts';

export function initUpdateService(window: BrowserWindow) {
  initAppUpdater(window);
  registerUpdateIpcHandlers({
    autoUpdater,
    getMainWindow,
    sendUpdateStatus,
    setUpdateState,
    getUpdateStatusPayload,
    checkGitHubRelease,
    checkAllBinaryUpdates,
    downloadBinaryUpdate,
    openBinaryReleaseUrl,
  });
}

export type { UpdateStatus, BinaryUpdateInfo, BinaryName } from './types.ts';
