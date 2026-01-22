import { useCallback } from 'react';
import { type SubtitleItem } from '@/types/subtitle';
import { generateSubtitleId } from '@/services/utils/id';
import { timeToSeconds, formatTime } from '@/services/subtitle/time';

interface UseSubtitleCRUDProps {
  setSubtitles: React.Dispatch<React.SetStateAction<SubtitleItem[]>>;
}

export function useSubtitleCRUD({ setSubtitles }: UseSubtitleCRUDProps) {
  const updateSubtitleText = useCallback(
    (id: string, text: string) => {
      setSubtitles((prev) => prev.map((s) => (s.id === id ? { ...s, translated: text } : s)));
    },
    [setSubtitles]
  );

  const updateSubtitleOriginal = useCallback(
    (id: string, text: string) => {
      setSubtitles((prev) => prev.map((s) => (s.id === id ? { ...s, original: text } : s)));
    },
    [setSubtitles]
  );

  const updateSpeaker = useCallback(
    (id: string, speaker: string | undefined) => {
      setSubtitles((prev) => prev.map((s) => (s.id === id ? { ...s, speaker } : s)));
    },
    [setSubtitles]
  );

  const updateSubtitleTime = useCallback(
    (id: string, startTime: string, endTime: string) => {
      setSubtitles((prev) => prev.map((s) => (s.id === id ? { ...s, startTime, endTime } : s)));
    },
    [setSubtitles]
  );

  const updateLineComment = useCallback(
    (id: string, comment: string) => {
      setSubtitles((prev) => prev.map((s) => (s.id === id ? { ...s, comment } : s)));
    },
    [setSubtitles]
  );

  const deleteSubtitle = useCallback(
    (id: string) => {
      setSubtitles((prev) => prev.filter((s) => s.id !== id));
    },
    [setSubtitles]
  );

  const deleteMultipleSubtitles = useCallback(
    (ids: string[]) => {
      const idSet = new Set(ids);
      setSubtitles((prev) => prev.filter((s) => !idSet.has(s.id)));
    },
    [setSubtitles]
  );

  const addSubtitle = useCallback(
    (referenceId: string, position: 'before' | 'after', defaultTime: string) => {
      setSubtitles((prev) => {
        // Find the index of the reference subtitle
        const refIndex = prev.findIndex((s) => s.id === referenceId);
        if (refIndex === -1) return prev;

        // Calculate endTime with 2 second offset to ensure valid duration
        const startSeconds = timeToSeconds(defaultTime);
        const endTime = formatTime(startSeconds + 2); // Default 2 second duration

        // Create new subtitle with properly offset times
        const newSubtitle: SubtitleItem = {
          id: generateSubtitleId(),
          startTime: defaultTime,
          endTime: endTime,
          original: '',
          translated: '',
        };

        // Insert at the appropriate position
        const insertIndex = position === 'before' ? refIndex : refIndex + 1;
        const newSubtitles = [...prev];
        newSubtitles.splice(insertIndex, 0, newSubtitle);
        return newSubtitles;
      });
    },
    [setSubtitles]
  );

  return {
    updateSubtitleText,
    updateSubtitleOriginal,
    updateSpeaker,
    updateSubtitleTime,
    updateLineComment,
    deleteSubtitle,
    deleteMultipleSubtitles,
    addSubtitle,
  };
}
