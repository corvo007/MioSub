import { type SubtitleItem } from '@/types/subtitle';
import { type SpeakerUIProfile } from '@/types/speaker';
import { toAssTime } from '@/services/subtitle/time';
import { getSpeakerColorWithCustom } from '@/services/utils/colors';
import { sanitizeSpeakerForStyle } from './utils';
import { containsJapaneseKana } from '@/services/utils/language';

// Helper to convert Hex (#RRGGBB) to ASS BGR (&HBBGGRR)
// Helper to convert Hex (#RRGGBB) to ASS BGR (&HBBGGRR)
const hexToAssBgr = (hex?: string): string => {
  if (!hex) return '&H00FFFFFF'; // Default to white
  const cleanHex = hex.replace('#', '');
  const r = cleanHex.substring(0, 2);
  const g = cleanHex.substring(2, 4);
  const b = cleanHex.substring(4, 6);
  return `&H00${b}${g}${r}`;
};

/**
 * Returns the preferred font based on language content.
 * JP -> MS Mincho (Serif/Mincho) - Matches standard Japanese subtitle aesthetics
 * CN/Other -> Noto Sans SC (Sans-serif) - Matches standard Chinese aesthetics
 */
const getFontForText = (text: string, languageCode?: string): string => {
  if (languageCode === 'ja') return 'Noto Sans JP';
  if (languageCode === 'zh') return 'Noto Sans SC';
  return containsJapaneseKana(text) ? 'Noto Sans JP' : 'Noto Sans SC';
};

export const generateSrtContent = (
  subtitles: SubtitleItem[],
  bilingual: boolean = true,
  includeSpeaker: boolean = false
): string => {
  return subtitles
    .map((sub, index) => {
      // Conditionally prepend speaker name
      const speakerPrefix = includeSpeaker && sub.speaker ? `${sub.speaker}: ` : '';

      // If bilingual is true, show original then translated. If false, only translated.
      const originalLine = speakerPrefix + sub.original;
      const translatedLine = speakerPrefix + sub.translated;
      const text = bilingual ? `${originalLine}\n${translatedLine}` : translatedLine;

      return `${index + 1}
${sub.startTime} --> ${sub.endTime}
${text}
`;
    })
    .join('\n');
};

// Heuristic: If > threshold of lines contain Japanese Kana, assume the track is Japanese.
// Threshold protects against "teaching videos" (mixed content) or AI hallucinations.
const detectLanguageForLines = (lines: string[]): 'ja' | 'zh' => {
  const total = lines.length;
  if (total === 0) return 'zh';

  const kanaCount = lines.filter((text) => containsJapaneseKana(text)).length;
  // Threshold: If more than 5% of lines OR more than 5 lines (absolute) contain Kana, it's Japanese.
  // This allows short Japanese clips to work, while ignoring occasional accidental Kana in Chinese tracks.
  const isJapanese = kanaCount > 0 && (kanaCount / total > 0.05 || kanaCount > 5);

  return isJapanese ? 'ja' : 'zh';
};

export const generateAssContent = (
  subtitles: SubtitleItem[],
  title: string,
  bilingual: boolean = true,
  includeSpeaker: boolean = false,
  useSpeakerColors: boolean = false,
  speakerProfiles?: SpeakerUIProfile[]
): string => {
  // Updated Styles:
  // Default: Fontsize 82 (Large), White (Primary) -> Used for Translation
  // Secondary: Fontsize 54 (Small), Yellow (Original) -> Used for Original Text

  // Detect language separately for Original and Translated tracks
  const langOriginal = detectLanguageForLines(subtitles.map((s) => s.original));
  const langTranslated = detectLanguageForLines(subtitles.map((s) => s.translated));

  // Default font for styles
  const defaultFont = langTranslated === 'ja' ? 'Noto Sans JP' : 'Noto Sans SC';

  // Generate speaker styles
  // We prefer to iterate over ALL profiles if provided, or derive unique speakers from subtitles if not.
  // Using profiles allows us to include styles even for speakers not currently speaking (metadata preservation)
  // and maintain stable mapping.

  let speakerStylesStr = '';

  if (useSpeakerColors) {
    // If we have profiles, use them to generate robust ID-based styles
    if (speakerProfiles && speakerProfiles.length > 0) {
      speakerStylesStr = speakerProfiles
        .map((profile) => {
          const color = getSpeakerColorWithCustom(profile.name, profile.color);
          const bgrColor = hexToAssBgr(color);
          const sanitizedSpeaker = sanitizeSpeakerForStyle(profile.name);

          // Use ShortID if available for Uniqueness, otherwise just sanitized name
          const uniqueSuffix = profile.shortId ? `_${profile.shortId}` : '';
          const styleName = `Speaker_${sanitizedSpeaker}${uniqueSuffix}`;

          return `Style: ${styleName},${defaultFont},82,${bgrColor},&H000000FF,&H00000000,&H00800000,0,0,0,0,100,100,0,0,1,2,1,2,10,10,10,1`;
        })
        .join('\n');
    } else {
      // Fallback: derive from subtitles (Legacy/No-Profile mode)
      const uniqueSpeakers = Array.from(
        new Set(subtitles.map((s) => s.speaker).filter(Boolean))
      ) as string[];
      speakerStylesStr = uniqueSpeakers
        .map((speaker) => {
          const color = getSpeakerColorWithCustom(speaker);
          const bgrColor = hexToAssBgr(color);
          const sanitizedSpeaker = sanitizeSpeakerForStyle(speaker);
          const styleName = `Speaker_${sanitizedSpeaker}`;
          return `Style: ${styleName},${defaultFont},82,${bgrColor},&H000000FF,&H00000000,&H00800000,0,0,0,0,100,100,0,0,1,2,1,2,10,10,10,1`;
        })
        .join('\n');
    }
  }

  const header = `[Script Info]
; Script generated by MioSub
Title: ${title}
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.601
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${defaultFont},82,&H00FFFFFF,&H000000FF,&H00000000,&H00800000,0,0,0,0,100,100,0,0,1,2,1,2,10,10,10,1
Style: Secondary,${defaultFont},54,&H0000FFFF,&H000000FF,&H00000000,&H00800000,0,0,0,0,100,100,0,0,1,2,1,2,10,10,10,1
${speakerStylesStr}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const events = subtitles
    .map((sub) => {
      const start = toAssTime(sub.startTime);
      const end = toAssTime(sub.endTime);

      // Handle speaker prefix if enabled (in explicit text)
      const speakerPrefix = includeSpeaker && sub.speaker ? `${sub.speaker}: ` : '';

      // Prepare raw text
      const originalText = speakerPrefix + (sub.original || '');
      const translatedText = speakerPrefix + (sub.translated || '');
      const cleanOriginal = originalText.replace(/\n/g, '\\N').replace(/\r/g, '');
      const cleanTranslated = translatedText.replace(/\n/g, '\\N').replace(/\r/g, '');

      const fontOriginal = getFontForText(sub.original || '', langOriginal);
      const fontTranslated = getFontForText(sub.translated || '', langTranslated);

      // Determine Style Name
      let style = 'Default';
      if (useSpeakerColors) {
        if (sub.speakerId && speakerProfiles) {
          // ID-based lookup (Strong Link)
          let profile = speakerProfiles.find((p) => p.id === sub.speakerId);

          // Fallback: Name-based lookup if ID failed but name exists
          if (!profile && sub.speaker) {
            profile = speakerProfiles.find((p) => p.name === sub.speaker);
          }

          if (profile) {
            const sanitizedSpeaker = sanitizeSpeakerForStyle(profile.name);
            const uniqueSuffix = profile.shortId ? `_${profile.shortId}` : '';
            style = `Speaker_${sanitizedSpeaker}${uniqueSuffix}`;
          } else if (sub.speaker) {
            // Fallback to name if generic (Speaker not in profile list)
            style = `Speaker_${sanitizeSpeakerForStyle(sub.speaker)}`;
          }
        } else if (sub.speaker) {
          // Fallback to name-based (Legacy)
          style = `Speaker_${sanitizeSpeakerForStyle(sub.speaker)}`;
        }
      }

      let text = '';
      if (bilingual) {
        // Layout: Original (Small/Secondary) on TOP (Secondary Style). Translated (Large/Default/SpeakerStyle) on BOTTOM.
        text = `{\\rSecondary}{\\fn${fontOriginal}}${cleanOriginal}\\N{\\r${style}}{\\fn${fontTranslated}}${cleanTranslated}`;
      } else {
        text = `{\\fn${fontTranslated}}${cleanTranslated}`;
      }

      const nameField = sub.speaker || '';

      return `Dialogue: 0,${start},${end},${style},${nameField},0,0,0,,${text}`;
    })
    .join('\n');

  return header + events;
};
