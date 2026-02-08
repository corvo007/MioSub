/**
 * Language Utilities
 *
 * Provides language code conversion and detection utilities.
 * Supports ISO 639-1, ISO 639-3, and BCP 47 locale codes.
 */

import { logger } from './logger';
// Use static import to ensure ngrams data is bundled at build time
// (dynamic import via 'eld' fails in production because Vite can't bundle dynamic paths)
import eld from 'eld/medium';
import { type Glossary } from '@/types/glossary';

// ============================================================================
// ISO 639-1 to ISO 639-3 Mapping (2-letter to 3-letter)
// ============================================================================

const ISO_639_1_TO_3: Record<string, string> = {
  zh: 'cmn',
  ja: 'jpn',
  en: 'eng',
  ko: 'kor',
  de: 'deu',
  fr: 'fra',
  es: 'spa',
  ru: 'rus',
  ar: 'ara',
  pt: 'por',
  it: 'ita',
  vi: 'vie',
  th: 'tha',
  id: 'ind',
  ms: 'msa',
  hi: 'hin',
  tr: 'tur',
  pl: 'pol',
  nl: 'nld',
  sv: 'swe',
};

// ============================================================================
// ISO 639-3 to BCP 47 Locale Mapping
// ============================================================================

const ISO_639_3_TO_LOCALE: Record<string, string> = {
  // ISO 639-3 codes
  eng: 'en',
  cmn: 'zh-CN',
  zho: 'zh-CN',
  jpn: 'ja',
  kor: 'ko',
  deu: 'de',
  fra: 'fr',
  spa: 'es',
  rus: 'ru',
  ara: 'ar',
  por: 'pt',
  ita: 'it',
  vie: 'vi',
  tha: 'th',
  ind: 'id',
  msa: 'ms',
  hin: 'hi',
  tur: 'tr',
  pol: 'pl',
  nld: 'nl',
  swe: 'sv',
  // ISO 639-1 codes (for convenience)
  en: 'en',
  zh: 'zh-CN',
  ja: 'ja',
  ko: 'ko',
  de: 'de',
  fr: 'fr',
  es: 'es',
  ru: 'ru',
  ar: 'ar',
  pt: 'pt',
  it: 'it',
  vi: 'vi',
  th: 'th',
  id: 'id',
  ms: 'ms',
  hi: 'hi',
  tr: 'tr',
  pl: 'pl',
  nl: 'nl',
  sv: 'sv',
};

// ============================================================================
// Language Code Conversion Functions
// ============================================================================

/**
 * Convert ISO 639-1 (2-letter) to ISO 639-3 (3-letter) language code.
 *
 * @param code - ISO 639-1 code (e.g., 'zh', 'ja', 'en')
 * @returns ISO 639-3 code (e.g., 'cmn', 'jpn', 'eng')
 */
export function iso639_1To3(code: string): string {
  return ISO_639_1_TO_3[code.toLowerCase()] || code;
}

/**
 * Convert ISO 639-3 (3-letter) to ISO 639-1 (2-letter) language code.
 *
 * @param code - ISO 639-3 code (e.g., 'cmn', 'jpn', 'eng')
 * @returns ISO 639-1 code (e.g., 'zh', 'ja', 'en')
 */
export function iso639_3To1(code: string): string {
  const reverseMapping: Record<string, string> = {};
  for (const [key, value] of Object.entries(ISO_639_1_TO_3)) {
    reverseMapping[value] = key;
  }
  return reverseMapping[code.toLowerCase()] || code;
}

/**
 * Convert any language code to BCP 47 locale code for Intl APIs.
 * Accepts both ISO 639-1 and ISO 639-3 codes.
 *
 * @param code - Language code (e.g., 'cmn', 'jpn', 'zh', 'ja')
 * @returns BCP 47 locale code (e.g., 'zh-CN', 'ja', 'en')
 */
export function toLocaleCode(code: string): string {
  return ISO_639_3_TO_LOCALE[code.toLowerCase()] || code;
}

// ============================================================================
// Language Detection
// ============================================================================

/**
 * Fallback language detection using Unicode character ranges.
 * Used when eld library fails or returns no result.
 *
 * Detection priority:
 * 1. Japanese: Contains Hiragana (U+3040-309F) or Katakana (U+30A0-30FF)
 * 2. Korean: Contains Hangul (U+AC00-D7AF, U+1100-11FF)
 * 3. Chinese: Contains CJK Unified Ideographs (U+4E00-9FFF) without Japanese kana
 * 4. Default: English
 */
function detectLanguageFallback(text: string): string {
  // Japanese: has hiragana or katakana
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) {
    return 'ja';
  }

  // Korean: has hangul
  if (/[\uAC00-\uD7AF\u1100-\u11FF]/.test(text)) {
    return 'ko';
  }

  // Chinese: has CJK ideographs (but no kana, already checked above)
  if (/[\u4E00-\u9FFF]/.test(text)) {
    return 'zh';
  }

  // Default to English
  return 'en';
}

/**
 * Detect language from text using the eld library.
 * Falls back to character-based CJK detection if eld fails.
 * Returns ISO 639-1 language code.
 *
 * @param text - Text to detect language from
 * @returns ISO 639-1 language code (e.g., 'zh', 'ja', 'en')
 */
export async function detectLanguage(text: string): Promise<string> {
  try {
    const result = eld.detect(text);
    if (result.language) {
      return result.language;
    }
    // eld returned empty result, use fallback
    logger.debug(
      `detectLanguage: eld returned empty for "${text.substring(0, 30)}...", using fallback`
    );
  } catch (e: any) {
    logger.warn(
      `detectLanguage: eld.detect() failed for "${text.substring(0, 30)}...": ${e.message}, using fallback`
    );
  }

  // Fallback to character-based detection
  const fallbackLang = detectLanguageFallback(text);
  logger.info(`detectLanguage: fallback detection → ${fallbackLang}`);
  return fallbackLang;
}

/**
 * Detect the language of a glossary's translations using ELD.
 * Synchronous — concatenates all translation fields and runs detection.
 *
 * @param glossary - Glossary to detect language for
 * @returns BCP 47 locale code (e.g., 'zh-CN', 'ja', 'en')
 */
export function detectGlossaryLanguage(glossary: Glossary): string {
  const text = glossary.terms.map((t) => t.translation).join(' ');
  if (!text.trim()) return 'en';

  try {
    const result = eld.detect(text);
    if (result.language) {
      return toLocaleCode(result.language);
    }
  } catch (e: any) {
    logger.warn(`detectGlossaryLanguage: eld failed: ${e.message}`);
  }

  // Fallback to character-based detection
  return toLocaleCode(detectLanguageFallback(text));
}

// ============================================================================
// Language Classification
// ============================================================================

/** CJK language codes (Chinese, Japanese, Korean) */
export const CJK_LANGUAGES = ['zh', 'cmn', 'zho', 'ja', 'jpn', 'ko', 'kor', 'yue'];

/** Chinese language codes */
export const CHINESE_LANGUAGES = ['zh', 'cmn', 'zho', 'zh-cn', 'zh-tw', 'yue'];

/** Japanese language codes */
export const JAPANESE_LANGUAGES = ['ja', 'jpn'];

/**
 * Check if a language code is CJK (Chinese, Japanese, or Korean).
 */
export function isCJK(code: string): boolean {
  return CJK_LANGUAGES.includes(code.toLowerCase());
}

/**
 * Check if a language code is Chinese.
 */
export function isChinese(code: string): boolean {
  return CHINESE_LANGUAGES.includes(code.toLowerCase());
}

/**
 * Check if a language code is Japanese.
 */
export function isJapanese(code: string): boolean {
  return JAPANESE_LANGUAGES.includes(code.toLowerCase());
}

/**
 * Check if text contains Japanese Kana (Hiragana or Katakana).
 * Useful for fast synchronous content detection (e.g. for font selection).
 *
 * @param text - The text to check
 * @returns true if text contains Japanese Kana characters
 */
export function containsJapaneseKana(text: string): boolean {
  return /[\u3040-\u309F\u30A0-\u30FF]/.test(text);
}

// ============================================================================
// Language Name Mapping
// ============================================================================

/** ISO 639-3 to full language name for prompts */
const ISO_639_3_TO_NAME: Record<string, string> = {
  cmn: 'Simplified Chinese',
  zho: 'Simplified Chinese',
  yue: 'Cantonese',
  eng: 'English',
  jpn: 'Japanese',
  kor: 'Korean',
  spa: 'Spanish',
  fra: 'French',
  deu: 'German',
  rus: 'Russian',
  ara: 'Arabic',
  hin: 'Hindi',
  ben: 'Bengali',
  por: 'Portuguese',
  ita: 'Italian',
  vie: 'Vietnamese',
  tha: 'Thai',
  ind: 'Indonesian',
  msa: 'Malay',
  tur: 'Turkish',
  pol: 'Polish',
  nld: 'Dutch',
  swe: 'Swedish',
  // BCP 47 locale codes
  'zh-cn': 'Simplified Chinese',
  'zh-tw': 'Traditional Chinese',
  // ISO 639-1 codes for convenience
  zh: 'Simplified Chinese',
  en: 'English',
  ja: 'Japanese',
  ko: 'Korean',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  ru: 'Russian',
  ar: 'Arabic',
  hi: 'Hindi',
  pt: 'Portuguese',
  it: 'Italian',
  vi: 'Vietnamese',
  th: 'Thai',
  id: 'Indonesian',
  ms: 'Malay',
  tr: 'Turkish',
  pl: 'Polish',
  nl: 'Dutch',
  sv: 'Swedish',
};

/**
 * Convert language code to full language name (for prompts).
 * Accepts both ISO 639-1 and ISO 639-3 codes.
 *
 * @param code - Language code (e.g., 'cmn', 'jpn', 'zh', 'ja')
 * @returns Full language name (e.g., 'Simplified Chinese', 'Japanese')
 */
export function toLanguageName(code: string): string {
  // If the input is already a full name (exists in values), return it as is
  // This supports backward compatibility if settings still have full names
  const lowerCode = code.toLowerCase();
  const knownNames = Object.values(ISO_639_3_TO_NAME).map((n) => n.toLowerCase());
  if (knownNames.includes(lowerCode)) {
    // Return the properly cased name from map if possible, or title case it, or just return original
    const entry = Object.entries(ISO_639_3_TO_NAME).find(
      ([, name]) => name.toLowerCase() === lowerCode
    );
    return entry ? entry[1] : code;
  }

  return ISO_639_3_TO_NAME[lowerCode] || 'English';
}

/**
 * Return a language name localized to the current UI locale.
 * e.g. toLocalizedLanguageName('zh-CN', 'zh-CN') → '简体中文'
 *      toLocalizedLanguageName('zh-CN', 'en')    → 'Simplified Chinese'
 */
const SCRIPT_CODE_MAP: Record<string, string> = {
  'zh-cn': 'zh-Hans',
  'zh-tw': 'zh-Hant',
  'zh-hk': 'zh-Hant',
};

export function toLocalizedLanguageName(code: string, uiLocale?: string): string {
  const displayCode = SCRIPT_CODE_MAP[code.toLowerCase()] || code;
  try {
    const name = new Intl.DisplayNames([uiLocale || 'en'], { type: 'language' }).of(displayCode);
    if (name) return name;
  } catch {
    // Intl not available or invalid code — fall through
  }
  return toLanguageName(code);
}
