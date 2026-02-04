import path from 'path';
import fs from 'fs';
import * as Sentry from '@sentry/electron/main';
import { getStorageDir, isPortableMode } from '../utils/paths.ts';

const SETTINGS_FILE = 'gemini-subtitle-pro-settings.json';
const HISTORY_FILE = 'gemini-subtitle-pro-history.json';
const SNAPSHOTS_FILE = 'gemini-subtitle-pro-snapshots.json';

export interface WorkspaceHistoryItem {
  id: string;
  filePath: string;
  fileName: string;
  subtitles: any[];
  savedAt: string;
}

export interface SaveResult {
  success: boolean;
  error?: string;
  errorCode?: 'write_failed' | 'verify_failed' | 'parse_failed' | 'dir_not_writable';
}

export class StorageService {
  private settingsPath: string;
  private historyPath: string;
  private snapshotsPath: string;
  private storageDir: string;

  constructor() {
    this.storageDir = getStorageDir();
    if (!fs.existsSync(this.storageDir)) {
      try {
        fs.mkdirSync(this.storageDir, { recursive: true });
      } catch (error) {
        console.error('Failed to create storage directory:', error);
        Sentry.captureException(error, {
          tags: { action: 'create_storage_dir' },
          extra: { storageDir: this.storageDir, isPortable: isPortableMode() },
        });
      }
    }

    this.settingsPath = path.join(this.storageDir, SETTINGS_FILE);
    this.historyPath = path.join(this.storageDir, HISTORY_FILE);
    this.snapshotsPath = path.join(this.storageDir, SNAPSHOTS_FILE);
  }

  // Settings methods - with verification and Sentry reporting
  async saveSettings(data: any): Promise<SaveResult> {
    try {
      const jsonString = JSON.stringify(data, null, 2);

      // Write to file
      await fs.promises.writeFile(this.settingsPath, jsonString, 'utf-8');

      // Verify write by reading back and parsing
      const verifyData = await fs.promises.readFile(this.settingsPath, 'utf-8');
      const parsed = JSON.parse(verifyData);

      // Quick sanity check - ensure critical fields match
      if (
        data.whisperModelPath !== undefined &&
        parsed.whisperModelPath !== data.whisperModelPath
      ) {
        const error = new Error('Settings verification failed: whisperModelPath mismatch');
        Sentry.captureException(error, {
          tags: { action: 'save_settings', errorCode: 'verify_failed' },
          extra: {
            storageDir: this.storageDir,
            isPortable: isPortableMode(),
            expected: data.whisperModelPath,
            actual: parsed.whisperModelPath,
          },
        });
        return {
          success: false,
          error: 'Settings verification failed',
          errorCode: 'verify_failed',
        };
      }

      return { success: true };
    } catch (error: any) {
      console.error('Failed to save settings:', error);

      // Report to Sentry with context
      Sentry.captureException(error, {
        tags: { action: 'save_settings', errorCode: 'write_failed' },
        extra: {
          storageDir: this.storageDir,
          settingsPath: this.settingsPath,
          isPortable: isPortableMode(),
          errorMessage: error.message,
          errorCode: error.code,
        },
      });

      return {
        success: false,
        error: error.message || 'Failed to save settings',
        errorCode: 'write_failed',
      };
    }
  }

  async readSettings(): Promise<any | null> {
    try {
      if (!fs.existsSync(this.settingsPath)) {
        return null;
      }
      const data = await fs.promises.readFile(this.settingsPath, 'utf-8');
      return JSON.parse(data);
    } catch (error: any) {
      console.error('Failed to read settings:', error);

      // Report to Sentry - this is a critical failure
      Sentry.captureException(error, {
        tags: { action: 'read_settings', errorCode: 'parse_failed' },
        extra: {
          storageDir: this.storageDir,
          settingsPath: this.settingsPath,
          isPortable: isPortableMode(),
          errorMessage: error.message,
        },
      });

      return null;
    }
  }

  /**
   * Check if the storage directory is writable
   * Useful for detecting portable mode issues early
   */
  isStorageWritable(): boolean {
    const testFile = path.join(this.storageDir, `.write-test-${Date.now()}`);
    try {
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
      return true;
    } catch {
      return false;
    }
  }

  getStorageInfo(): { path: string; isPortable: boolean; isWritable: boolean } {
    return {
      path: this.storageDir,
      isPortable: isPortableMode(),
      isWritable: this.isStorageWritable(),
    };
  }

  // History methods
  async saveHistory(histories: WorkspaceHistoryItem[]): Promise<boolean> {
    try {
      await fs.promises.writeFile(this.historyPath, JSON.stringify(histories, null, 2), 'utf-8');
      return true;
    } catch (error) {
      console.error('Failed to save history:', error);
      return false;
    }
  }

  async readHistory(): Promise<WorkspaceHistoryItem[]> {
    try {
      if (!fs.existsSync(this.historyPath)) {
        return [];
      }
      const data = await fs.promises.readFile(this.historyPath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Failed to read history:', error);
      return [];
    }
  }

  async deleteHistoryItem(id: string): Promise<boolean> {
    try {
      const histories = await this.readHistory();
      const updated = histories.filter((h) => h.id !== id);
      return await this.saveHistory(updated);
    } catch (error) {
      console.error('Failed to delete history item:', error);
      return false;
    }
  }

  // Snapshot methods
  async saveSnapshots(snapshots: any[]): Promise<boolean> {
    try {
      await fs.promises.writeFile(this.snapshotsPath, JSON.stringify(snapshots, null, 2), 'utf-8');
      return true;
    } catch (error) {
      console.error('Failed to save snapshots:', error);
      return false;
    }
  }

  async readSnapshots(): Promise<any[]> {
    try {
      if (!fs.existsSync(this.snapshotsPath)) {
        return [];
      }
      const data = await fs.promises.readFile(this.snapshotsPath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Failed to read snapshots:', error);
      return [];
    }
  }
}

export const storageService = new StorageService();
