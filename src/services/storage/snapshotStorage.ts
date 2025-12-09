import { SubtitleSnapshot } from '@/types/subtitle';

const STORAGE_KEY = 'gemini-subtitle-snapshots';

/**
 * Snapshot storage service with support for both web (localStorage) and Electron (file system)
 */
export const snapshotStorage = {
  /**
   * Save snapshots to persistent storage
   */
  async save(snapshots: SubtitleSnapshot[]): Promise<boolean> {
    try {
      // Electron: use IPC to save to file system
      if (window.electronAPI?.snapshots) {
        return await window.electronAPI.snapshots.save(snapshots);
      }
      // Web: use localStorage
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshots));
      return true;
    } catch (error) {
      console.error('Failed to save snapshots:', error);
      return false;
    }
  },

  /**
   * Load snapshots from persistent storage
   */
  async load(): Promise<SubtitleSnapshot[]> {
    try {
      // Electron: use IPC to read from file system
      if (window.electronAPI?.snapshots) {
        return await window.electronAPI.snapshots.get();
      }
      // Web: use localStorage
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) return [];
      return JSON.parse(data);
    } catch (error) {
      console.error('Failed to load snapshots:', error);
      return [];
    }
  },

  /**
   * Clear all snapshots from storage
   */
  async clear(): Promise<boolean> {
    try {
      if (window.electronAPI?.snapshots) {
        return await window.electronAPI.snapshots.save([]);
      }
      localStorage.removeItem(STORAGE_KEY);
      return true;
    } catch (error) {
      console.error('Failed to clear snapshots:', error);
      return false;
    }
  },
};
