import { useEffect } from 'react';
import { type SubtitleItem } from '@/types/subtitle';
import { type SpeakerUIProfile } from '@/types/speaker';
import { GenerationStatus } from '@/types/api';
import { logger } from '@/services/utils/logger';
import { type SnapshotsValuesProps } from '@/types/workspace';

interface UseAutoSaveProps {
  subtitles: SubtitleItem[];
  batchComments: Record<string, string>;
  status: GenerationStatus;
  file: File | null;
  speakerProfiles: SpeakerUIProfile[];
  snapshotsValues: Pick<SnapshotsValuesProps, 'createAutoSaveSnapshot'>;
}

/**
 * Hook to manage auto-save functionality for subtitles.
 * - Interval-based: saves every 5 minutes if conditions are met
 * - Debounced: saves 30 seconds after the last edit
 */
export function useAutoSave({
  subtitles,
  batchComments,
  status,
  file,
  speakerProfiles,
  snapshotsValues,
}: UseAutoSaveProps): void {
  // Debounced auto-save: triggers 30 seconds after last edit
  useEffect(() => {
    // Only enable when there are subtitles, status is completed, and file exists
    if (subtitles.length === 0 || status !== GenerationStatus.COMPLETED || !file) {
      return;
    }

    const DEBOUNCE_DELAY = 30 * 1000; // 30 seconds after last edit

    const timeoutId = setTimeout(() => {
      const fileId = window.electronAPI?.getFilePath?.(file) || file.name;
      const saved = snapshotsValues.createAutoSaveSnapshot(
        subtitles,
        batchComments,
        fileId,
        file.name,
        speakerProfiles
      );
      if (saved) {
        logger.info('Debounced auto-save snapshot created');
      }
    }, DEBOUNCE_DELAY);

    return () => clearTimeout(timeoutId);
  }, [subtitles, batchComments, status, file, speakerProfiles, snapshotsValues]);
}
