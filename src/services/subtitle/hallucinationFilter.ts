/**
 * Whisper Anti-Hallucination Filter
 *
 * Multi-layer defense against Whisper transcription hallucinations,
 * inspired by WhisperJAV's 7-layer architecture.
 *
 * Phase 1 (per-segment, run in TranscriptionStep.postProcess):
 *   - Exact-match hallucination blacklist
 *   - Non-verbal segment detection
 *
 * Phase 2 (text cleaning + cross-subtitle, run in postProcess + post-merge):
 *   - Repetition cleaning regexes (Japanese kana patterns)
 *   - Cross-subtitle consecutive deduplication
 *
 * @see docs/plans/2026-02-17-whisperjav-anti-hallucination-research.md
 */

import { type SubtitleItem } from '@/types/subtitle';
import { timeToSeconds } from '@/services/subtitle/time';
import { logger } from '@/services/utils/logger';

// ============================================================================
// Phase 1: Exact-match hallucination blacklist
// ============================================================================

/**
 * Known Whisper hallucination phrases — well-documented false outputs that
 * Whisper generates from silence, noise, or non-speech audio.
 *
 * Curated from WhisperJAV's filter_list_v08.json. Only includes phrases with
 * near-zero false-positive risk when matched as the ENTIRE segment text.
 *
 * Intentionally excludes legitimate dialogue (e.g. "I'm sorry", "Thank you",
 * "good night") even though Whisper sometimes hallucinates them, because they
 * also appear frequently in real speech.
 */
const HALLUCINATION_BLACKLIST: string[] = [
  // ── English: Single-char / short fillers (entire segment) ──
  'a',
  'aa',
  'h',
  'ha',
  'haa',
  'hah',
  'haha',
  'hahaha',
  'ah',
  'ahh',
  'hm',
  'hmm',
  'huh',
  'm',
  'mh',
  'mm',
  'mmh',
  'mmm',
  'o',
  'oh',

  // ── English: Meta references ──
  'Thank you for watching.',
  'Thanks for watching!',
  'subscribe',
  'translated by',
  'translation by',
  'my channel',
  'our channel',
  'the channel',
  'next video',
  'full video',
  'for watching',
  'for your viewing',
  'follow me on',
  'see you next week',
  "We'll be right back.",
  "We'll see you next week.",
  'Amara',

  // ── English: Well-documented nonsensical Whisper hallucinations ──
  // These are sentences Whisper frequently generates from pure silence/noise.
  // They have near-zero probability of being actual subtitle content.
  "I'm hungry",
  "I'm hungry.",
  "I'm going to put the baby on the floor",
  "I'm glad you're doing well.",
  'Her daughter is crying loudly',
  'Her daughter is crying loudly.',
  'Her daughter is sleeping while wiping her hands.',
  'My daughter cried loudly',
  'My daughter cried loudly.',
  'The dog is very excited.',
  'Try falling asleep',
  'baby crying',
  'dog crying',
  "daughter's cry",
  "daughter's cry.",
  'cormorant',
  'grandmother',

  // ── Chinese: Meta references / credits ──
  '字幕by索兰娅',
  '字幕由Amara.org社区提供',
  '字幕製作人Zither Harp',
  '小明星大跟班下次再見',
  '小編字幕由Amara.org社區提供',
  '掌聲鼓勵',
  '請不吝點贊訂閱轉發打賞支持明鏡與點點欄目',

  // ── Japanese: Meta / closing ──
  'ご視聴ありがとうございました',

  // ── Korean: Meta references ──
  '구독과 좋아요 부탁드려요!',
];

/**
 * Lowercase Set for O(1) case-insensitive lookup.
 * Case-insensitive matching is safe because CJK has no case distinction.
 */
const BLACKLIST_SET = new Set(HALLUCINATION_BLACKLIST.map((s) => s.toLowerCase()));

function isExactHallucination(text: string): boolean {
  return BLACKLIST_SET.has(text.toLowerCase());
}

// ============================================================================
// Phase 1: Non-verbal segment detection
// ============================================================================

/**
 * Known non-verbal utterances (exact match).
 * These are breathing, sighing, and vocalization sounds that Whisper
 * generates from non-speech audio (ASMR, ambient, etc.)
 */
const NON_VERBAL_EXACT = new Set([
  // Breathing / sighing
  'はぁ',
  'ハァ',
  'あぁ',
  'アァ',
  'うぅ',
  'ウゥ',
  'ふぅ',
  'フゥ',
  'えぇ',
  'エェ',
  'おぉ',
  'オォ',
  'はぁはぁ',
  'ハァハァ',
  // Short non-verbal exclamations
  'うっ',
  'あっ',
  'えっ',
  'おっ',
  'あー',
  'うー',
]);

/**
 * Single kana characters that are almost always Whisper artifacts
 * when they appear as the entire segment text.
 */
const NONVERBAL_SINGLE_CHARS = new Set([
  'あ',
  'ア',
  'い',
  'イ',
  'う',
  'ウ',
  'え',
  'エ',
  'お',
  'オ',
  'ん',
  'ン',
]);

/**
 * Regex patterns for non-verbal segments.
 * A segment is considered non-verbal if its ENTIRE text matches.
 */
const NON_VERBAL_PATTERNS: RegExp[] = [
  // Pure vowel sounds ≥3 chars: ああああ, ウウウウ, etc.
  /^[あアぁァいイぃィうウぅゥえエぇェおオぉォ]{3,}$/,
  // Repeated breathing pairs ≥2: はぁはぁ, アァアァ, etc.
  /^(?:はぁ|ハァ|あぁ|アァ|うぅ|ウゥ|ふぅ|フゥ|えぇ|エェ|おぉ|オォ){2,}$/,
  // Repeated glottal stops ≥3: あっあっあっ, etc.
  /^(?:あっ|うっ|えっ|おっ|アッ|ウッ|エッ|オッ){3,}$/,
];

function isNonVerbal(text: string): boolean {
  if (text.length === 1 && NONVERBAL_SINGLE_CHARS.has(text)) return true;
  if (NON_VERBAL_EXACT.has(text)) return true;
  return NON_VERBAL_PATTERNS.some((p) => p.test(text));
}

/**
 * Phase 1: Filter hallucinated and non-verbal segments.
 * Removes segments whose entire text is a known hallucination or non-verbal sound.
 */
export function filterHallucinatedSegments(segments: SubtitleItem[]): SubtitleItem[] {
  const result: SubtitleItem[] = [];
  let removedBlacklist = 0;
  let removedNonVerbal = 0;

  for (const seg of segments) {
    const text = seg.original.trim();
    if (isExactHallucination(text)) {
      removedBlacklist++;
      continue;
    }
    if (isNonVerbal(text)) {
      removedNonVerbal++;
      continue;
    }
    result.push(seg);
  }

  const totalRemoved = removedBlacklist + removedNonVerbal;
  if (totalRemoved > 0) {
    logger.info(
      `[HallucinationFilter] Removed ${removedBlacklist} blacklisted + ${removedNonVerbal} non-verbal segments (${result.length} remaining)`
    );
  }

  return result;
}

// ============================================================================
// Phase 2a: Repetition cleaning (text-level)
// ============================================================================

/**
 * Repetition cleaning patterns adapted from WhisperJAV's RepetitionCleaner.
 * Each entry: [name, regex, replacement].
 *
 * Order matters: more specific patterns run first to prevent over-matching.
 * The kana ranges [ぁ-んァ-ヴ] cover hiragana (U+3041-U+3093) and
 * katakana (U+30A1-U+30F4, including ヴ).
 */
const REPETITION_PATTERNS: [string, RegExp, string][] = [
  // 1. Phrase with separator: あ!!あ!!あ!!あ!! → あ!!
  ['phrase_with_separator', /([\p{L}\p{N}]{1,8}[、,!！\s?？。・]+)\1{3,}/gu, '$1'],

  // 2. Multi-char kana word: ハッハッハッハッ → ハッハッ
  ['multi_char_word', /([ぁ-んァ-ヴ]{2,4})\1{3,}/gu, '$1$1'],

  // 3. Phrase with comma: ゆーちゃん、ゆーちゃん、ゆーちゃん、 → ゆーちゃん、
  ['phrase_with_comma', /([\p{L}\p{N}]{1,10}[、,]\s*)\1{2,}/gu, '$1'],

  // 4. Single char whitespace flood: あ\nあ\nあ\nあ → ああ
  ['single_char_whitespace_flood', /([ぁ-んァ-ヴ])(?:[\s\u3000]*\1){3,}/gu, '$1$1'],

  // 5. Prefix + char flood: あらららら → あらら
  ['prefix_plus_char', /([ぁ-んァ-ヴ]{1,2})([ぁ-んァ-ヴ])\2{3,}/gu, '$1$2$2'],

  // 6. Single char flood: ううううう → うう
  ['single_char_flood', /([ぁ-んァ-ヴ])\1{3,}/gu, '$1$1'],

  // 7. Vowel extension: あ〜〜〜〜 → あ〜〜
  ['vowel_extension', /([ぁ-んァ-ヴ])([〜ー～])\2{3,}/gu, '$1$2$2'],

  // 8. Excessive vowel repetition (10+ → 2): あああああああああああ → ああ
  ['excessive_vowel', /([あアぁァいイぃィうウぅゥえエぇェおオぉォ])\1{9,}/gu, '$1$1'],

  // 9. Excessive extension marks (10+ → 3): ～～～～～～～～～～ → ～～～
  ['excessive_extension', /([～〜ー])\1{9,}/gu, '$1$1$1'],

  // 10. Repeated punctuation (3+ → 1): 、、、、 → 、
  ['repeated_punctuation', /([、，。．!！?？])\1{2,}/gu, '$1'],
];

/**
 * Phase 2a: Clean repetitive patterns from segment text.
 * Modifies text content; does NOT remove the segment.
 */
export function cleanRepetitions(text: string): string {
  let result = text;
  for (const [, pattern, replacement] of REPETITION_PATTERNS) {
    pattern.lastIndex = 0;
    result = result.replace(pattern, replacement);
  }
  return result.trim();
}

// ============================================================================
// Phase 2b: Cross-subtitle consecutive deduplication
// ============================================================================

/** Minimum consecutive near-identical segments to trigger merge */
const DEDUP_MIN_CONSECUTIVE = 3;
/** Maximum time gap (ms) between segments to consider them consecutive */
const DEDUP_MAX_GAP_MS = 600;
/** Minimum text similarity (Dice coefficient) for dedup */
const DEDUP_SIMILARITY_THRESHOLD = 0.9;

/**
 * Dice coefficient on character bigrams — fast similarity measure
 * for detecting near-identical subtitle text.
 */
function textSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const bigramsA = new Set<string>();
  for (let i = 0; i < a.length - 1; i++) bigramsA.add(a.slice(i, i + 2));

  let matches = 0;
  for (let i = 0; i < b.length - 1; i++) {
    if (bigramsA.has(b.slice(i, i + 2))) matches++;
  }

  return (2 * matches) / (a.length - 1 + (b.length - 1));
}

/**
 * Phase 2b: Merge consecutive near-duplicate subtitles.
 * When ≥3 consecutive segments have near-identical text (within a small time gap),
 * keep only the first occurrence with extended end time.
 *
 * This catches Whisper's "stuck loop" failure mode where it generates
 * the same phrase repeatedly across multiple segments.
 */
export function deduplicateConsecutive(segments: SubtitleItem[]): SubtitleItem[] {
  if (segments.length < DEDUP_MIN_CONSECUTIVE) return segments;

  const result: SubtitleItem[] = [];
  let i = 0;
  let totalMerged = 0;

  while (i < segments.length) {
    const current = segments[i];
    const group = [current];
    let j = i + 1;

    while (j < segments.length) {
      const next = segments[j];

      // Check time gap between end of last group member and start of next
      const gapMs =
        (timeToSeconds(next.startTime) - timeToSeconds(group[group.length - 1].endTime)) * 1000;
      if (gapMs > DEDUP_MAX_GAP_MS) break;

      // Check text similarity
      const sim = textSimilarity(current.original.trim(), next.original.trim());
      if (sim >= DEDUP_SIMILARITY_THRESHOLD) {
        group.push(next);
        j++;
      } else {
        break;
      }
    }

    if (group.length >= DEDUP_MIN_CONSECUTIVE) {
      // Merge: keep first text, extend to last segment's end time
      result.push({
        ...current,
        endTime: group[group.length - 1].endTime,
      });
      totalMerged += group.length - 1;
    } else {
      // Keep all segments as-is
      for (const seg of group) result.push(seg);
    }

    i = j;
  }

  if (totalMerged > 0) {
    logger.info(
      `[HallucinationFilter] Dedup: merged ${totalMerged} consecutive duplicate segments`
    );
  }

  return result;
}
