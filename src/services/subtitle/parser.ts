import type { SubtitleItem, GeminiSubtitleSchema } from '@/types/subtitle';
import { timeToSeconds, normalizeTimestamp, formatTime } from '@/services/subtitle/time';
import { generateSubtitleId } from '@/services/utils/id';
import { extractSpeakerFromText } from '@/services/speaker/speakerUtils';
import { logger } from '@/services/utils/logger';

/**
 * Known non-speech annotations from Whisper transcription
 * Format: [TEXT], (text), *text*
 * Add new patterns here when encountered
 */
const NON_SPEECH_KEYWORDS = [
  // English
  'laughter',
  'laughing',
  'laugh',
  'laughts',
  'music',
  'music playing',
  'applause',
  'clapping',
  'cough',
  'coughing',
  'sigh',
  'sighing',
  'door',
  'footsteps',
  'silence',
  'pause',
  'inaudible',
  'unintelligible',
  'background noise',
  'static',
  'ending',
  'ending song',
  'opening',
  'opening song',
  'theme song',
  // Japanese
  '笑',
  '笑い',
  '笑い声',
  '音楽',
  '音楽再生',
  '拍手',
  '咳',
  '咳払い',
  'ため息',
  'エンディング',
  'オープニング',
  'テーマ曲',
  // Chinese
  '笑声',
  '掌声',
  '音乐',
  '片尾曲',
  '片头曲',
  '主题曲',
];

// Build regex pattern from keywords
const keywordPattern = NON_SPEECH_KEYWORDS.map((k) =>
  k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
).join('|');
// Match: [keyword], (keyword), （keyword）, *keyword*, ♪keyword♪ - case insensitive
const NON_SPEECH_PATTERN = new RegExp(
  `\\s*(?:\\[[^\\]]*(?:${keywordPattern})[^\\]]*\\]|\\([^)]*(?:${keywordPattern})[^)]*\\)|（[^）]*(?:${keywordPattern})[^）]*）|\\*[^*]*(?:${keywordPattern})[^*]*\\*|♪[^♪]*(?:${keywordPattern})[^♪]*♪)\\s*`,
  'gi'
);

/**
 * Remove known non-speech annotations from Whisper transcription
 * e.g., "(laughter)", "[MUSIC]", "*coughing*"
 */
export function cleanNonSpeechAnnotations(text: string): string {
  return text.replace(NON_SPEECH_PATTERN, ' ').replace(/\s+/g, ' ').trim();
}

export const parseSrt = (content: string): SubtitleItem[] => {
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const blocks = normalized.split(/\n\n+/);
  const items: SubtitleItem[] = [];

  blocks.forEach((block) => {
    const lines = block.trim().split('\n');
    if (lines.length < 3) return;

    // Line 1: ID
    // Line 2: Time
    // Line 3+: Text

    // Sometimes index 0 is empty if file starts with newlines
    let startIndex = 0;
    if (!lines[0].match(/^\d+$/) && lines[1]?.match(/^\d+$/)) startIndex = 1;

    // Check if it looks like a valid block
    const timeLine = lines[startIndex + 1];
    if (!timeLine || !timeLine.includes('-->')) return;

    const [start, end] = timeLine.split('-->').map((t) => t.trim());
    const textLines = lines.slice(startIndex + 2);

    // Heuristic for Bilingual SRT:
    // If we have multiple lines, we try to split them.
    // Case 1: 2 lines -> Line 1 = Original, Line 2 = Translated
    // Case 2: Even number of lines -> First half = Original, Second half = Translated
    // Case 3: Odd number of lines > 1 -> First line = Original, Rest = Translated (or vice versa? Let's assume 1st line is Source)
    // Fallback: All to Original

    let original = '';
    let translated = '';

    if (textLines.length === 2) {
      original = textLines[0];
      translated = textLines[1];
    } else if (textLines.length > 2 && textLines.length % 2 === 0) {
      const mid = textLines.length / 2;
      original = textLines.slice(0, mid).join('\n');
      translated = textLines.slice(mid).join('\n');
    } else {
      // Default fallback or odd lines: Treat all as original for now,
      // OR if user specifically wants "New Project" style which is usually 1 line orig / 1 line trans
      // Let's try to detect if it looks like a split.
      // For now, let's just put everything in original if it's ambiguous,
      // BUT the user specifically asked to support "generated format".
      // The generated format is `Original\nTranslated`.
      // So if there are multiple lines, we should try to split.
      if (textLines.length > 1) {
        // Simple split: First line original, rest translated?
        // Or maybe the user edited it to be multi-line.
        // Let's stick to the "Split in half" heuristic if possible, otherwise just 1st line vs rest.
        original = textLines[0];
        translated = textLines.slice(1).join('\n');
      } else {
        original = textLines.join('\n');
      }
    }

    // --- Speaker Extraction Logic ---
    // Format: "Speaker Name: Content"
    // We check both original and translated lines.
    // If both have the same speaker, we extract it.
    // If only one has it, we extract it.
    // If they differ, we prefer the one from 'original' (or maybe just take the first one found).

    let speaker: string | undefined = undefined;

    const origRes = extractSpeakerFromText(original);
    const transRes = extractSpeakerFromText(translated);

    if (origRes.speaker) {
      speaker = origRes.speaker;
      original = origRes.content;
    }

    // If translated also has speaker, remove it.
    // If we didn't find speaker in original (rare if bilingual export), take it from translated.
    if (transRes.speaker) {
      if (!speaker) speaker = transRes.speaker;
      translated = transRes.content;
    }

    items.push({
      id: generateSubtitleId(),
      startTime: normalizeTimestamp(start),
      endTime: normalizeTimestamp(end),
      original: original,
      translated: translated,
      speaker: speaker,
    });
  });
  return items;
};

/**
 * Convert ASS BGR color (&HBBGGRR or &HAABBGGRR) to hex RGB (#RRGGBB)
 */
const assBgrToHex = (assBgr: string): string => {
  // Remove &H prefix and any alpha channel
  const clean = assBgr.replace(/^&H/i, '').toUpperCase();
  // Handle both &HBBGGRR (6 chars) and &HAABBGGRR (8 chars)
  const bgr = clean.length === 8 ? clean.substring(2) : clean;
  if (bgr.length !== 6) return '';
  const b = bgr.substring(0, 2);
  const g = bgr.substring(2, 4);
  const r = bgr.substring(4, 6);
  return `#${r}${g}${b}`;
};

/**
 * Parse ASS styles section and extract speaker colors
 * Returns a map of speaker name to hex color
 */
export const parseAssStyles = (content: string): Record<string, string> => {
  const lines = content.split(/\r?\n/);
  const speakerColors: Record<string, string> = {};
  let inStyles = false;
  let styleFormat: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === '[V4+ Styles]' || trimmed === '[V4 Styles]') {
      inStyles = true;
      continue;
    }
    if (trimmed.startsWith('[') && inStyles) {
      // Exited styles section
      break;
    }
    if (!inStyles) continue;

    if (trimmed.startsWith('Format:')) {
      styleFormat = trimmed
        .substring(7)
        .split(',')
        .map((s) => s.trim().toLowerCase());
      continue;
    }

    if (trimmed.startsWith('Style:') && styleFormat.length > 0) {
      const parts = trimmed
        .substring(6)
        .split(',')
        .map((s) => s.trim());
      const nameIdx = styleFormat.indexOf('name');
      const colorIdx = styleFormat.indexOf('primarycolour');

      if (nameIdx === -1 || colorIdx === -1) continue;

      const styleName = parts[nameIdx];
      const color = parts[colorIdx];

      // Only extract Speaker_ styles
      // Note: Style name is sanitized during export, so we store it as-is
      // The consumer (useFileOperations) should sanitize speaker names when looking up
      if (styleName?.startsWith('Speaker_') && color) {
        const speakerName = styleName.substring(8); // Remove "Speaker_" prefix (already sanitized)
        const hexColor = assBgrToHex(color);
        if (hexColor) {
          speakerColors[speakerName] = hexColor;
        }
      }
    }
  }

  return speakerColors;
};

export const parseAss = (content: string): SubtitleItem[] => {
  const lines = content.split(/\r?\n/);
  const items: SubtitleItem[] = [];
  let format: string[] = [];

  // Find Events section
  let inEvents = false;

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (trimmed === '[Events]') {
      inEvents = true;
      return;
    }

    // Exit Events section when encountering a new section
    if (inEvents && trimmed.startsWith('[') && trimmed.endsWith(']')) {
      inEvents = false;
      return;
    }

    if (!inEvents) return;

    if (trimmed.startsWith('Format:')) {
      format = trimmed
        .substring(7)
        .split(',')
        .map((s) => s.trim().toLowerCase());
      return;
    }

    if (trimmed.startsWith('Dialogue:')) {
      if (format.length === 0) return; // Need format first

      const parts = trimmed.substring(9).split(',');
      if (parts.length > format.length) {
        // Join the last text parts back together because text can contain commas
        const textPart = parts.slice(format.length - 1).join(',');
        parts.splice(format.length - 1, parts.length - (format.length - 1), textPart);
      }

      const startIdx = format.indexOf('start');
      const endIdx = format.indexOf('end');
      const textIdx = format.indexOf('text');
      const styleIdx = format.indexOf('style');
      const nameIdx = format.indexOf('name');

      if (startIdx === -1 || endIdx === -1 || textIdx === -1) return;

      let rawText = parts[textIdx] || '';

      // Extract speaker: Priority is Name field > Style field > text content
      let speaker: string | undefined = undefined;

      // 1. Try Name field first (our preferred storage location)
      if (nameIdx !== -1) {
        const name = parts[nameIdx]?.trim() || '';
        if (name) {
          speaker = name;
        }
      }

      // 2. Fallback to Style field (e.g., "Speaker_吉岡茉祐" -> "吉岡茉祐")
      if (!speaker && styleIdx !== -1) {
        const style = parts[styleIdx]?.trim() || '';
        if (style.startsWith('Speaker_')) {
          speaker = style.substring(8); // Remove "Speaker_" prefix
        }
      }

      // Parse specific generator tags:
      // Old format: {\rSecondary}ORIGINAL\N{\r}TRANSLATED
      // New format: {\rSecondary}ORIGINAL\N{\rDefault}TRANSLATED (or {\rSpeaker_XXX})
      // Or just TRANSLATED (if target_only)

      let original = '';
      let translated = '';

      // Check for our specific bilingual signature (supports both old and new formats)
      // Old: {\r} (implicit reset), New: {\rStyleName} (explicit style)
      const hasSecondary = rawText.includes('{\\rSecondary}');
      // Match {\r} or {\rSomething} - the reset tag that marks the start of translated text
      const resetTagMatch = rawText.match(/{\\r([^}]*)}/g);
      const hasResetAfterSecondary = resetTagMatch && resetTagMatch.length >= 2;

      if (hasSecondary && hasResetAfterSecondary) {
        // Extract Original: everything between {\rSecondary} and the next {\r...} tag
        const secondaryMatch = rawText.match(/{\\rSecondary}(.*?)(?:\\N)?{\\r/);
        if (secondaryMatch) {
          original = secondaryMatch[1];
        }

        // Extract Translated: everything after the second {\r...} tag
        // Split by {\r and take the part after the second occurrence
        const parts = rawText.split(/{\\r[^}]*}/);
        if (parts.length > 2) {
          // parts[0] = before {\rSecondary}, parts[1] = original text, parts[2] = translated text
          translated = parts[2] || '';
        } else if (parts.length > 1) {
          // Fallback: try to get the last part
          translated = parts[parts.length - 1] || '';
        }
      } else {
        // Fallback: Treat as Original
        original = rawText;
      }

      // Clean up ASS tags from the extracted text
      const clean = (t: string) =>
        t
          .replace(/{[^}]+}/g, '')
          .replace(/\\N/g, '\n')
          .trim();

      original = clean(original);
      translated = clean(translated);

      // If speaker was found from Name/Style fields and text was exported with "Include Speaker",
      // we need to strip the "Speaker: " prefix from text to avoid duplication.
      // But we do NOT extract speaker from text content for ASS files - ASS has dedicated fields for that.
      if (speaker) {
        const origRes = extractSpeakerFromText(original);
        const transRes = extractSpeakerFromText(translated);

        // Only strip prefix if it matches the speaker we already found
        if (origRes.speaker === speaker) {
          original = origRes.content;
        }
        if (transRes.speaker === speaker) {
          translated = transRes.content;
        }
      }
      // Note: We intentionally do NOT extract speaker from text content for ASS files.
      // ASS format has dedicated Name and Style fields for speaker information.

      items.push({
        id: generateSubtitleId(),
        startTime: normalizeTimestamp(parts[startIdx]),
        endTime: normalizeTimestamp(parts[endIdx]),
        original: original,
        translated: translated,
        speaker: speaker,
      });
    }
  });
  return items;
};

// ============================================================================
// Gemini Response Parsing
// ============================================================================

import { safeParseJsonArray } from '@/services/utils/jsonParser';

export const parseGeminiResponse = (
  jsonResponse: string | null | undefined,
  maxDuration?: number
): SubtitleItem[] => {
  if (!jsonResponse) return [];
  try {
    // Use unified JSON parser with jsonrepair
    let items: GeminiSubtitleSchema[] = safeParseJsonArray<GeminiSubtitleSchema>(jsonResponse);

    // Filter and map
    items = items.filter((item) => {
      // Robust key access
      const rawOriginal =
        item.text_original ||
        (item as any).original_text ||
        (item as any).original ||
        item.text ||
        '';
      const rawTranslated =
        item.text_translated ||
        (item as any).translated_text ||
        (item as any).translated ||
        (item as any).translation ||
        '';

      // Mutate item to normalized keys for next step
      item.text_original = String(rawOriginal).trim();
      item.text_translated = String(rawTranslated).trim();
      return item.text_original.length > 0 || item.text_translated.length > 0;
    });

    return items
      .map((item) => {
        if (!item.start || !item.end) return null;

        // Validate Timestamps against maxDuration if provided
        // This prevents the "03:24:45" bug in a 20 min video
        if (maxDuration) {
          const startSec = timeToSeconds(item.start);
          if (startSec > maxDuration + 10) {
            // Allow small buffer
            return null;
          }
        }

        let startStr = normalizeTimestamp(item.start, maxDuration);
        let endStr = normalizeTimestamp(item.end, maxDuration);

        let startSec = timeToSeconds(startStr);
        let endSec = timeToSeconds(endStr);

        if (startSec > endSec) {
          const tempSec = startSec;
          startSec = endSec;
          endSec = tempSec;
          startStr = formatTime(startSec);
          endStr = formatTime(endSec);
        }
        if (endSec - startSec < 0.5) {
          endSec = startSec + 1.5;
          endStr = formatTime(endSec);
        }
        return {
          id: (item as any).id ? String((item as any).id) : generateSubtitleId(),
          startTime: startStr,
          endTime: endStr,
          original: item.text_original || '',
          translated: item.text_translated || '',
          speaker: (item as any).speaker || undefined,
        };
      })
      .filter((item) => item !== null) as SubtitleItem[];
  } catch (e) {
    logger.error('Failed to parse JSON from Gemini', {
      error: e,
      responseText: jsonResponse?.slice(0, 1000),
    });
    return [];
  }
};

/**
 * Load subtitle segments from a JSON or SRT file.
 * For debug/testing purposes - loads mock data from files.
 * @param filePath - Path to JSON (SubtitleItem[]) or SRT file
 * @returns Parsed subtitle items
 */
export async function loadSegmentsFromFile(filePath: string): Promise<SubtitleItem[]> {
  if (!window.electronAPI?.readLocalFile) {
    throw new Error('File reading requires Electron environment');
  }

  const buffer = await window.electronAPI.readLocalFile(filePath);
  const content = new TextDecoder('utf-8').decode(buffer);

  if (filePath.endsWith('.json')) {
    // Parse as JSON array of SubtitleItem
    const data = JSON.parse(content);
    if (Array.isArray(data)) {
      return data as SubtitleItem[];
    }
    if (data?.segments && Array.isArray(data.segments)) {
      return data.segments as SubtitleItem[];
    }
    throw new Error('JSON file must contain an array of segments');
  } else if (filePath.endsWith('.srt')) {
    return parseSrt(content);
  } else if (filePath.endsWith('.ass')) {
    return parseAss(content);
  }

  throw new Error(`Unsupported file format: ${filePath}`);
}
