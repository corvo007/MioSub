import { useCallback } from 'react';
import { type SubtitleItem } from '@/types/subtitle';
import { generateSubtitleId } from '@/services/utils/id';
import { timeToSeconds, formatTime } from '@/services/subtitle/time';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';

export function useSubtitleCRUD() {
  const updateSubtitleText = useCallback((id: string, text: string) => {
    useWorkspaceStore.setState((state) => ({
      subtitles: state.subtitles.map((s) => (s.id === id ? { ...s, translated: text } : s)),
    }));
  }, []);

  const updateSubtitleOriginal = useCallback((id: string, text: string) => {
    useWorkspaceStore.setState((state) => ({
      subtitles: state.subtitles.map((s) => (s.id === id ? { ...s, original: text } : s)),
    }));
  }, []);

  const updateSpeaker = useCallback((id: string, speakerId: string | undefined) => {
    useWorkspaceStore.setState((state) => {
      // Look up profile to get name for cache
      const profile = state.speakerProfiles.find((p) => p.id === speakerId);
      const speakerName = profile ? profile.name : undefined; // Use undefined if not found (or cleared)

      return {
        subtitles: state.subtitles.map((s) =>
          s.id === id ? { ...s, speakerId: speakerId, speaker: speakerName } : s
        ),
      };
    });
  }, []);

  const updateSubtitleTime = useCallback((id: string, startTime: string, endTime: string) => {
    useWorkspaceStore.setState((state) => ({
      subtitles: state.subtitles.map((s) => (s.id === id ? { ...s, startTime, endTime } : s)),
    }));
  }, []);

  const updateLineComment = useCallback((id: string, comment: string) => {
    useWorkspaceStore.setState((state) => ({
      subtitles: state.subtitles.map((s) => (s.id === id ? { ...s, comment } : s)),
    }));
  }, []);

  const deleteSubtitle = useCallback((id: string) => {
    useWorkspaceStore.setState((state) => ({
      subtitles: state.subtitles.filter((s) => s.id !== id),
    }));
  }, []);

  const deleteMultipleSubtitles = useCallback((ids: string[]) => {
    const idSet = new Set(ids);
    useWorkspaceStore.setState((state) => ({
      subtitles: state.subtitles.filter((s) => !idSet.has(s.id)),
    }));
  }, []);

  const addSubtitle = useCallback(
    (referenceId: string, position: 'before' | 'after', defaultTime: string) => {
      useWorkspaceStore.setState((state) => {
        const prev = state.subtitles;
        // Find the index of the reference subtitle
        const refIndex = prev.findIndex((s) => s.id === referenceId);
        if (refIndex === -1) return { subtitles: prev };

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
        return { subtitles: newSubtitles };
      });
    },
    []
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
