import { type SubtitleItem } from '@/types/subtitle';

// Trailing punctuation pattern covering CJK + Latin + full-width
const TRAILING_PUNCTUATION = /[\s。！？，、；：…．·.!?,;:\-—–]+$/;

export function stripTrailingPunctuation(text: string): string {
  return text.replace(TRAILING_PUNCTUATION, '');
}

export function removeTrailingPunctuation(segments: SubtitleItem[]): SubtitleItem[] {
  return segments.map((seg) => ({
    ...seg,
    original: seg.original ? stripTrailingPunctuation(seg.original) : seg.original,
    translated: seg.translated ? stripTrailingPunctuation(seg.translated) : seg.translated,
  }));
}
