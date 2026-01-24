/**
 * Helper to process imported subtitles (normalization, state update, snapshot)
 * Shared between Web and Native import handlers.
 */
import type { SubtitleItem } from '@/types/subtitle';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';
import { GenerationStatus } from '@/types/api';
import type { SnapshotsValuesProps } from '@/types/workspace';
import { parseAssStyles } from '@/services/subtitle/parser';
import { sanitizeSpeakerForStyle } from '@/services/speaker/speakerUtils';
import { normalizeSubtitles } from '@/services/speaker/normalizer';
import { t } from 'i18next';

export const processSubtitleImport = (
  parsed: SubtitleItem[],
  fileName: string,
  fileType: 'ass' | 'srt',
  fileId: string,
  content: string | null, // Content needed for ASS style parsing
  snapshotsValues: Pick<SnapshotsValuesProps, 'setSnapshots' | 'createSnapshot'>
) => {
  const { setSubtitles, setSubtitleFileName, setSpeakerProfiles, setStatus, setBatchComments } =
    useWorkspaceStore.getState();

  setSubtitles(parsed);
  setSubtitleFileName(fileName);

  // Extract and set speaker profiles with colors from ASS styles
  // normalizeSubtitles expects { RawName: Color }
  const speakerColors = fileType === 'ass' && content ? parseAssStyles(content) : {};
  const rawToColorMap: Record<string, string> = {};

  if (fileType === 'ass') {
    const uniqueSpeakers = Array.from(
      new Set(parsed.map((s) => s.speaker).filter(Boolean))
    ) as string[];
    uniqueSpeakers.forEach((rawName) => {
      const sanitized = sanitizeSpeakerForStyle(rawName);
      if (speakerColors[sanitized]) {
        rawToColorMap[rawName] = speakerColors[sanitized];
      }
    });
  }

  const { subtitles: normalizedSubs, profiles: newProfiles } = normalizeSubtitles(parsed, [], {
    importedColors: rawToColorMap,
    generateNewProfiles: true,
  });

  // Update store with IDs
  setSubtitles(normalizedSubs);
  setSpeakerProfiles(newProfiles);

  setStatus(GenerationStatus.COMPLETED);

  // Analytics: Subtitle Loaded
  if (window.electronAPI?.analytics) {
    void window.electronAPI.analytics.track(
      'editor_subtitle_loaded',
      {
        format: fileType,
        count: parsed.length,
      },
      'interaction'
    );
  }
  setBatchComments({});

  snapshotsValues.createSnapshot(
    t('services:snapshots.initialImport', { defaultValue: 'Initial Import' }),
    normalizedSubs,
    {},
    fileId,
    fileName,
    newProfiles
  );
};
