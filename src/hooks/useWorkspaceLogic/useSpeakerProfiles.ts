import { useCallback } from 'react';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';
import { createSpeakerId, generateShortId } from '@/services/speaker/speakerUtils';
import { getSpeakerColor } from '@/services/utils/colors';

export function useSpeakerProfiles() {
  const addSpeaker = useCallback((name: string) => {
    const id = createSpeakerId();
    useWorkspaceStore.setState((state) => ({
      speakerProfiles: [
        ...state.speakerProfiles,
        {
          id,
          name,
          color: getSpeakerColor(name),
          isStandard: false, // User created
          shortId: generateShortId(),
        },
      ],
    }));
    return id;
  }, []);

  const renameSpeaker = useCallback((profileId: string, newName: string) => {
    useWorkspaceStore.setState((state) => {
      const profile = state.speakerProfiles.find((p) => p.id === profileId);
      if (!profile) return {}; // No change

      // 1. Update Profile
      const newProfiles = state.speakerProfiles.map((p) =>
        p.id === profileId ? { ...p, name: newName } : p
      );

      // 2. Update Subtitles (Cache Consistency)
      // We only update the 'speaker' name cache. The ID link remains valid.
      const newSubtitles = state.subtitles.map((s) =>
        s.speakerId === profileId ? { ...s, speaker: newName } : s
      );

      return { subtitles: newSubtitles, speakerProfiles: newProfiles };
    });
  }, []);

  const deleteSpeaker = useCallback((profileId: string) => {
    useWorkspaceStore.setState((state) => {
      // 1. Clear speaker from subtitles
      const newSubtitles = state.subtitles.map((s) =>
        s.speakerId === profileId ? { ...s, speakerId: undefined, speaker: undefined } : s
      );

      // 2. Remove Profile
      const newProfiles = state.speakerProfiles.filter((p) => p.id !== profileId);

      return { subtitles: newSubtitles, speakerProfiles: newProfiles };
    });
  }, []);

  const mergeSpeakers = useCallback((sourceIds: string[], targetId: string) => {
    useWorkspaceStore.setState((state) => {
      const target = state.speakerProfiles.find((p) => p.id === targetId);
      if (!target) return {}; // Target not found

      // 1. Update Subtitles
      // All subtitles belonging to sourceIds -> move to targetId
      const newSubtitles = state.subtitles.map((s) => {
        if (s.speakerId && sourceIds.includes(s.speakerId)) {
          return {
            ...s,
            speakerId: targetId,
            speaker: target.name, // Update cache
          };
        }
        return s;
      });

      // 2. Remove Source Profiles
      const newProfiles = state.speakerProfiles.filter((p) => !sourceIds.includes(p.id));

      return { subtitles: newSubtitles, speakerProfiles: newProfiles };
    });
  }, []);

  const updateSpeakerColor = useCallback((profileId: string, color: string) => {
    useWorkspaceStore.setState((state) => ({
      speakerProfiles: state.speakerProfiles.map((p) => (p.id === profileId ? { ...p, color } : p)),
    }));
  }, []);

  // Note: We removed the auto-sync useEffect.
  // The store's profiles and subtitle.speakerId are now the source of truth.
  // New profiles should only be created via 'addSpeaker' or the Normalization process (Gatekeepers).

  return {
    addSpeaker,
    renameSpeaker,
    deleteSpeaker,
    mergeSpeakers,
    updateSpeakerColor,
  };
}
