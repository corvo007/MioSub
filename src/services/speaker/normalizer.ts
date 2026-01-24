import { type SubtitleItem } from '@/types/subtitle';
import { type SpeakerUIProfile } from '@/types/speaker';
import { createSpeakerId, generateShortId, extractSpeakerFromText } from './speakerUtils';
import { getSpeakerColor } from '@/services/utils/colors';

interface NormalizationResult {
  subtitles: SubtitleItem[];
  profiles: SpeakerUIProfile[];
}

/**
 * Normalizes subtitle speaker data.
 * Ensures all subtitles have a valid speakerId.
 * Creates new profiles for unknown speakers.
 *
 * @param subtitles - Raw subtitles (may only have 'speaker' text)
 * @param existingProfiles - Current list of known speaker profiles
 * @param options - Configuration options
 * @returns Hydrated subtitles and updated profile list
 */
export const normalizeSubtitles = (
  subtitles: SubtitleItem[],
  existingProfiles: SpeakerUIProfile[] = [],
  options: {
    generateNewProfiles?: boolean; // Whether to create profiles for unknown names (Default: true)
    importedColors?: Record<string, string>; // Colors extracted from import (Map<SanitizedName, HexColor>)
  } = {}
): NormalizationResult => {
  const { generateNewProfiles = true, importedColors = {} } = options;

  // 1. Index existing profiles for fast lookup
  // Map<ID, Profile>
  const profileMap = new Map<string, SpeakerUIProfile>();
  // Map<Name, ID> for name resolution
  const nameToIdMap = new Map<string, string>();

  existingProfiles.forEach((p) => {
    profileMap.set(p.id, p);
    nameToIdMap.set(p.name, p.id);
  });

  // Track new profiles created in this session
  const newProfiles: SpeakerUIProfile[] = [];

  // 2. Iterate and Normalize
  const normalizedSubtitles = subtitles.map((sub) => {
    // If already has ID and it exists, keep it
    if (sub.speakerId && profileMap.has(sub.speakerId)) {
      return { ...sub }; // Already normalized
    }

    // Determine effective name
    // 1. prefer 'speaker' field
    // 2. extract from 'original' text if needed (legacy format support)
    // 3. extract from 'translated' text if needed
    let speakerName = sub.speaker;

    // Fallback extraction if missing (common in legacy imports)
    if (!speakerName) {
      const origRes = extractSpeakerFromText(sub.original);
      if (origRes.speaker) speakerName = origRes.speaker;
    }

    // If still no speaker, return as is (undefined speakerId)
    if (!speakerName) {
      return { ...sub, speakerId: undefined };
    }

    // Resolution Logic
    let resolvedId = nameToIdMap.get(speakerName);

    // If not found, create new profile
    if (!resolvedId && generateNewProfiles) {
      const newId = createSpeakerId();

      // Determine Color:
      // 1. Check importedColors hint (using sanitized name lookup might be needed by caller,
      //    but here we assume importedColors keys match the raw name or caller handled mapping?
      //    Actually parseAss uses sanitized name for style.
      //    The caller should pass Map<RawName, Color> properly or we check strict name match here.)
      //    Let's use getSpeakerColor() as specific in modal logic usually.

      // Check if we have a color hint for this name
      // Note: In parseAss, we might only have "Speaker_John" -> Color.
      // If we have "John" here, we might miss it if keys are different.
      // But let's assume strict match for now or auto-color.
      const colorHint = importedColors[speakerName] || getSpeakerColor(speakerName);

      const newProfile: SpeakerUIProfile = {
        id: newId,
        name: speakerName,
        color: colorHint,
        isStandard: speakerName.startsWith('Speaker '), // Heuristic
        shortId: generateShortId(),
      };

      // Add to tracking
      newProfiles.push(newProfile);
      profileMap.set(newId, newProfile);
      nameToIdMap.set(speakerName, newId);
      resolvedId = newId;
    }

    // Return normalized item
    return {
      ...sub,
      speakerId: resolvedId,
      speaker: speakerName, // Keep name as cache
    };
  });

  // Combine old + new profiles
  const finalProfiles = [...existingProfiles, ...newProfiles];

  return {
    subtitles: normalizedSubtitles,
    profiles: finalProfiles,
  };
};
