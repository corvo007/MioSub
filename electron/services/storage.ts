import path from 'path';
import fs from 'fs';
import { getStorageDir } from '../utils/paths.ts';

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

export class StorageService {
  private settingsPath: string;
  private historyPath: string;
  private snapshotsPath: string;

  constructor() {
    const storageDir = getStorageDir();
    if (!fs.existsSync(storageDir)) {
      try {
        fs.mkdirSync(storageDir, { recursive: true });
      } catch (error) {
        console.error('Failed to create storage directory:', error);
      }
    }

    this.settingsPath = path.join(storageDir, SETTINGS_FILE);
    this.historyPath = path.join(storageDir, HISTORY_FILE);
    this.snapshotsPath = path.join(storageDir, SNAPSHOTS_FILE);
  }

  // Settings methods
  async saveSettings(data: any): Promise<boolean> {
    try {
      await fs.promises.writeFile(this.settingsPath, JSON.stringify(data, null, 2), 'utf-8');
      return true;
    } catch (error) {
      console.error('Failed to save settings:', error);
      return false;
    }
  }

  async readSettings(): Promise<any | null> {
    try {
      if (!fs.existsSync(this.settingsPath)) {
        return null;
      }
      const data = await fs.promises.readFile(this.settingsPath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Failed to read settings:', error);
      return null;
    }
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
