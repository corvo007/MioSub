import { useState, useEffect, useCallback } from 'react';
import { type SpeakerUIProfile } from '@/types/speaker';
import { type SubtitleItem } from '@/types/subtitle';

interface UseSpeakerProfilesProps {
  subtitles: SubtitleItem[];
  setSubtitles: React.Dispatch<React.SetStateAction<SubtitleItem[]>>;
}

export function useSpeakerProfiles({ subtitles, setSubtitles }: UseSpeakerProfilesProps) {
  const [speakerProfiles, setSpeakerProfiles] = useState<SpeakerUIProfile[]>([]);

  const addSpeaker = useCallback((name: string) => {
    const id = `speaker_${Date.now()}`;
    setSpeakerProfiles((prev) => [...prev, { id, name }]);
    return id;
  }, []);

  const renameSpeaker = useCallback(
    (profileId: string, newName: string) => {
      setSpeakerProfiles((prev) => {
        const profile = prev.find((p) => p.id === profileId);
        if (!profile) return prev;
        const oldName = profile.name;
        // Update subtitles with old name
        setSubtitles((subs) =>
          subs.map((s) => (s.speaker === oldName ? { ...s, speaker: newName } : s))
        );
        return prev.map((p) => (p.id === profileId ? { ...p, name: newName } : p));
      });
    },
    [setSubtitles]
  );

  const deleteSpeaker = useCallback(
    (profileId: string) => {
      setSpeakerProfiles((prev) => {
        const profile = prev.find((p) => p.id === profileId);
        if (!profile) return prev;
        // Clear speaker field from subtitles
        setSubtitles((subs) =>
          subs.map((s) => (s.speaker === profile.name ? { ...s, speaker: undefined } : s))
        );
        return prev.filter((p) => p.id !== profileId);
      });
    },
    [setSubtitles]
  );

  const mergeSpeakers = useCallback(
    (sourceIds: string[], targetId: string) => {
      const target = speakerProfiles.find((p) => p.id === targetId);
      if (!target) return;

      const sourcesDetails = speakerProfiles.filter((p) => sourceIds.includes(p.id));
      const sourceNames = sourcesDetails.map((p) => p.name);

      if (sourceNames.length === 0) return;

      // 1. Update Subtitles (using current source names)
      setSubtitles((subs) =>
        subs.map((s) =>
          s.speaker && sourceNames.includes(s.speaker) ? { ...s, speaker: target.name } : s
        )
      );

      // 2. Remove Merged Profiles
      setSpeakerProfiles((prev) => prev.filter((p) => !sourceIds.includes(p.id)));
    },
    [speakerProfiles, setSubtitles]
  );

  // Sync speaker profiles from subtitles (when subtitles change)
  useEffect(() => {
    const uniqueSpeakers = new Set<string>();
    subtitles.forEach((sub) => {
      if (sub.speaker) uniqueSpeakers.add(sub.speaker);
    });
    // Add any new speakers not in profiles
    setSpeakerProfiles((prev) => {
      const existingNames = new Set(prev.map((p) => p.name));
      const newProfiles = [...uniqueSpeakers]
        .filter((name) => !existingNames.has(name))
        .map((name) => ({
          id: `speaker_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          name,
        }));
      if (newProfiles.length === 0) return prev;
      return [...prev, ...newProfiles];
    });
  }, [subtitles]);

  return {
    speakerProfiles,
    setSpeakerProfiles,
    addSpeaker,
    renameSpeaker,
    deleteSpeaker,
    mergeSpeakers,
  };
}
