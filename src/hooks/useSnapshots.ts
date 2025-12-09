import { useState, useCallback, useRef, useEffect } from 'react';
import { SubtitleSnapshot, SubtitleItem } from '@/types/subtitle';
import { snapshotStorage } from '@/services/storage/snapshotStorage';

/**
 * Simple hash function for comparing subtitle and batch content
 */
const computeContentHash = (
  subtitles: SubtitleItem[],
  batchComments: Record<number, string>
): string => {
  const subtitleContent = subtitles
    .map(
      (s) =>
        `${s.id}|${s.startTime}|${s.endTime}|${s.original}|${s.translated}|${s.comment || ''}|${s.speaker || ''}`
    )
    .join('\n');
  const batchContent = Object.entries(batchComments)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([k, v]) => `${k}:${v}`)
    .join('|');
  const content = subtitleContent + '||BATCH||' + batchContent;
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(36);
};

/**
 * Custom hook for managing subtitle snapshots (history)
 * Maintains up to 20 snapshots for version control
 */
export const useSnapshots = () => {
  const [snapshots, setSnapshots] = useState<SubtitleSnapshot[]>([]);
  const lastSnapshotHashRef = useRef<string>('');

  const createSnapshot = useCallback(
    (
      description: string,
      subtitles: SubtitleItem[],
      batchComments: Record<number, string>,
      fileId: string = '',
      fileName: string = ''
    ) => {
      const newSnapshot: SubtitleSnapshot = {
        id: Date.now().toString(),
        timestamp: new Date().toLocaleTimeString(),
        description,
        subtitles: JSON.parse(JSON.stringify(subtitles)),
        batchComments: { ...batchComments },
        fileId,
        fileName,
      };
      // Keep最多20个快照
      setSnapshots((prev) => {
        const updated = [newSnapshot, ...prev].slice(0, 20);
        // Save to persistent storage
        snapshotStorage.save(updated);
        return updated;
      });
      // Update last hash
      lastSnapshotHashRef.current = computeContentHash(subtitles, batchComments);
    },
    []
  );

  const createAutoSaveSnapshot = useCallback(
    (
      subtitles: SubtitleItem[],
      batchComments: Record<number, string>,
      fileId: string = '',
      fileName: string = ''
    ): boolean => {
      if (subtitles.length === 0) return false;

      const currentHash = computeContentHash(subtitles, batchComments);
      if (currentHash === lastSnapshotHashRef.current) {
        // No changes since last snapshot
        return false;
      }

      const newSnapshot: SubtitleSnapshot = {
        id: Date.now().toString(),
        timestamp: new Date().toLocaleTimeString(),
        description: '自动保存',
        subtitles: JSON.parse(JSON.stringify(subtitles)),
        batchComments: { ...batchComments },
        fileId,
        fileName,
      };
      setSnapshots((prev) => {
        const updated = [newSnapshot, ...prev].slice(0, 20);
        snapshotStorage.save(updated);
        return updated;
      });
      lastSnapshotHashRef.current = currentHash;
      return true;
    },
    []
  );

  const deleteSnapshot = useCallback((id: string) => {
    setSnapshots((prev) => {
      const updated = prev.filter((s) => s.id !== id);
      snapshotStorage.save(updated);
      return updated;
    });
  }, []);

  const clearSnapshots = useCallback(() => {
    setSnapshots([]);
    lastSnapshotHashRef.current = '';
    snapshotStorage.clear();
  }, []);

  // Load snapshots from storage on mount
  useEffect(() => {
    const loadSnapshots = async () => {
      const loaded = await snapshotStorage.load();
      if (loaded.length > 0) {
        setSnapshots(loaded);
      }
    };
    loadSnapshots();
  }, []);

  return {
    snapshots,
    createSnapshot,
    createAutoSaveSnapshot,
    deleteSnapshot,
    clearSnapshots,
    setSnapshots,
  };
};
