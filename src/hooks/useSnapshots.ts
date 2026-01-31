import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { type SubtitleSnapshot, type SubtitleItem } from '@/types/subtitle';
import { type SpeakerUIProfile } from '@/types/speaker';
import { snapshotStorage } from '@/services/utils/snapshotStorage';

import { serializeSubtitleItem } from '@/services/subtitle/serializer';
import { serializeSpeakerProfile } from '@/services/speaker/speakerUtils';

/**
 * Simple hash function for comparing subtitle and batch content
 */
const computeContentHash = (
  subtitles: SubtitleItem[],
  batchComments: Record<string, string>,
  speakerProfiles?: SpeakerUIProfile[]
): string => {
  const subtitleContent = subtitles.map(serializeSubtitleItem).join('\n');
  const batchContent = Object.entries(batchComments)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([k, v]) => `${k}:${v}`)
    .join('|');
  const speakerContent = speakerProfiles?.map(serializeSpeakerProfile).join('|') || '';
  const content = subtitleContent + '||BATCH||' + batchContent + '||SPEAKERS||' + speakerContent;
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

/**
 * Generate a unique snapshot ID using timestamp + random suffix
 * Avoids collision when multiple snapshots are created in the same millisecond
 */
const generateSnapshotId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

export const useSnapshots = () => {
  const { t } = useTranslation('services');
  const [snapshots, setSnapshots] = useState<SubtitleSnapshot[]>([]);
  const lastSnapshotHashRef = useRef<string>('');

  const createSnapshot = useCallback(
    (
      description: string,
      subtitles: SubtitleItem[],
      batchComments: Record<string, string>,
      fileId: string = '',
      fileName: string = '',
      speakerProfiles?: SpeakerUIProfile[]
    ) => {
      const newSnapshot: SubtitleSnapshot = {
        id: generateSnapshotId(),
        timestamp: new Date().toLocaleString(),
        description,
        subtitles: structuredClone(subtitles),
        batchComments: { ...batchComments },
        fileId,
        fileName,
        speakerProfiles: speakerProfiles ? structuredClone(speakerProfiles) : undefined,
      };
      // Keep最多20个快照
      setSnapshots((prev) => {
        const updated = [newSnapshot, ...prev].slice(0, 20);
        // Save to persistent storage
        void snapshotStorage.save(updated);
        return updated;
      });
      // Update last hash
      lastSnapshotHashRef.current = computeContentHash(subtitles, batchComments, speakerProfiles);
    },
    []
  );

  const createAutoSaveSnapshot = useCallback(
    (
      subtitles: SubtitleItem[],
      batchComments: Record<string, string>,
      fileId: string = '',
      fileName: string = '',
      speakerProfiles?: SpeakerUIProfile[]
    ): boolean => {
      if (subtitles.length === 0) return false;

      const currentHash = computeContentHash(subtitles, batchComments, speakerProfiles);
      if (currentHash === lastSnapshotHashRef.current) {
        // No changes since last snapshot
        return false;
      }

      const newSnapshot: SubtitleSnapshot = {
        id: generateSnapshotId(),
        timestamp: new Date().toLocaleString(),
        description: t('snapshots.autoSave'),
        subtitles: structuredClone(subtitles),
        batchComments: { ...batchComments },
        fileId,
        fileName,
        speakerProfiles: speakerProfiles ? structuredClone(speakerProfiles) : undefined,
      };
      setSnapshots((prev) => {
        const updated = [newSnapshot, ...prev].slice(0, 20);
        void snapshotStorage.save(updated);
        return updated;
      });
      lastSnapshotHashRef.current = currentHash;
      return true;
    },
    [t]
  );

  const deleteSnapshot = useCallback((id: string) => {
    setSnapshots((prev) => {
      const updated = prev.filter((s) => s.id !== id);
      void snapshotStorage.save(updated);
      return updated;
    });
  }, []);

  const clearSnapshots = useCallback(() => {
    setSnapshots([]);
    lastSnapshotHashRef.current = '';
    void snapshotStorage.clear();
  }, []);

  // Load snapshots from storage on mount
  useEffect(() => {
    const loadSnapshots = async () => {
      const loaded = await snapshotStorage.load();
      if (loaded.length > 0) {
        setSnapshots(loaded);
      }
    };
    void loadSnapshots();
  }, []);

  return React.useMemo(
    () => ({
      snapshots,
      createSnapshot,
      createAutoSaveSnapshot,
      deleteSnapshot,
      clearSnapshots,
      setSnapshots,
    }),
    [snapshots, createSnapshot, createAutoSaveSnapshot, deleteSnapshot, clearSnapshots]
  );
};
