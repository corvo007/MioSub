import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { type SubtitleSnapshot, type SubtitleItem } from '@/types/subtitle';
import { type SpeakerUIProfile } from '@/types/speaker';
import { type SnapshotsValuesProps } from '@/types/workspace';

interface SnapshotRestoreWorkspace {
  file: File | null;
  subtitles: SubtitleItem[];
  setSubtitles: (subs: SubtitleItem[]) => void;
  batchComments: Record<number, string>;
  setBatchComments: (comments: Record<number, string>) => void;
  speakerProfiles: SpeakerUIProfile[];
  setSpeakerProfiles: (profiles: SpeakerUIProfile[]) => void;
  setSubtitleFileName: (name: string | null) => void;
  setSelectedBatches: (selected: Set<number>) => void;
  setEditingCommentId: (id: string | null) => void;
}

interface UseSnapshotRestoreProps {
  workspace: SnapshotRestoreWorkspace;
  snapshotsValues: Pick<SnapshotsValuesProps, 'createSnapshot' | 'deleteSnapshot'>;
  showConfirm: (
    title: string,
    message: string,
    onConfirm: () => void,
    type?: 'info' | 'warning' | 'danger'
  ) => void;
  setShowSnapshots: (show: boolean) => void;
}

export function useSnapshotRestore({
  workspace,
  snapshotsValues,
  showConfirm,
  setShowSnapshots,
}: UseSnapshotRestoreProps) {
  const { t } = useTranslation('app');

  const handleRestoreSnapshot = useCallback(
    (snap: SubtitleSnapshot) => {
      // Detect cross-file restore
      const currentFileId = workspace.file
        ? window.electronAPI?.getFilePath?.(workspace.file) || workspace.file.name
        : '';
      const isCrossFile = currentFileId && currentFileId !== snap.fileId;

      const message = isCrossFile
        ? t('confirmations.restoreSnapshot.messageWithFile', {
            fileName: snap.fileName,
            timestamp: snap.timestamp,
          })
        : t('confirmations.restoreSnapshot.messageGeneric', { timestamp: snap.timestamp });

      showConfirm(
        t('confirmations.restoreSnapshot.title'),
        message,
        () => {
          // 1. Backup current state (if there are subtitles)
          if (workspace.subtitles.length > 0) {
            snapshotsValues.createSnapshot(
              t('confirmations.restoreSnapshot.backupLabel'),
              workspace.subtitles,
              workspace.batchComments,
              currentFileId || 'unknown',
              workspace.file?.name || t('confirmations.restoreSnapshot.unknownFile'),
              workspace.speakerProfiles
            );
          }

          // 2. Restore subtitles and batch comments (use structuredClone for perf)
          workspace.setSubtitles(structuredClone(snap.subtitles));
          workspace.setBatchComments({ ...snap.batchComments });

          // 3. Sync speakerProfiles (use saved profiles if available, otherwise extract from subtitles)
          if (snap.speakerProfiles && snap.speakerProfiles.length > 0) {
            workspace.setSpeakerProfiles(structuredClone(snap.speakerProfiles));
          } else {
            const uniqueSpeakers = Array.from(
              new Set(snap.subtitles.map((s) => s.speaker).filter(Boolean))
            ) as string[];
            const profiles: SpeakerUIProfile[] = uniqueSpeakers.map((name) => ({
              id: name,
              name: name,
            }));
            workspace.setSpeakerProfiles(profiles);
          }

          // 4. Sync subtitle file name
          workspace.setSubtitleFileName(snap.fileName || null);

          // 5. Clear selection state
          workspace.setSelectedBatches(new Set());
          workspace.setEditingCommentId(null);

          // 6. Close snapshot panel
          setShowSnapshots(false);
        },
        'info'
      );
    },
    [workspace, snapshotsValues, showConfirm, setShowSnapshots, t]
  );

  return { handleRestoreSnapshot };
}
