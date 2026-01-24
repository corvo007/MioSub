/**
 * Language Utilities
 *
 * Provides language code conversion and detection utilities.
 * Supports ISO 639-1, ISO 639-3, and BCP 47 locale codes.
 */

import { logger } from './logger';
import eld from 'eld';

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

// Initialized flag/promise
let eldInitializationPromise: Promise<void> | null = null;

/**
 * Ensure ELD database is loaded.
 * Handles both static and dynamic versions of ELD.
 * Singleton pattern prevents multiple concurrent loads.
 */
async function ensureEldInitialized() {
  if (eldInitializationPromise !== null) return eldInitializationPromise;

  eldInitializationPromise = (async () => {
    try {
      // Check if eld has a load method (dynamic version)
      // @ts-ignore - eld might be Eld or EldWithLoader
      if (typeof eld.load === 'function') {
        // @ts-ignore
        await eld.load('medium'); // Load medium database
        logger.info('ELD (Efficient Language Detector) database loaded');
      }
    } catch (e) {
      logger.error('Failed to initialize ELD:', e);
      // We don't re-throw, just let it be (it might still work or default to en)
    }
  })();

  return eldInitializationPromise;
}

/**
 * Detect language from text using the eld library.
 * Returns ISO 639-1 language code.
 *
 * @param text - Text to detect language from
 * @returns ISO 639-1 language code (e.g., 'zh', 'ja', 'en')
 */
export async function detectLanguage(text: string): Promise<string> {
  await ensureEldInitialized();

  try {
    const result = eld.detect(text);
    if (!result.language) {
      logger.warn(
        `detectLanguage: No language detected for text: "${text.substring(0, 50)}...", defaulting to "en"`
      );
      return 'en';
    }
    return result.language;
  } catch (e: any) {
    logger.warn(
      `detectLanguage: eld.detect() failed used text: "${text.substring(0, 50)}...", error: ${e.message}`,
      e
    );
    return 'en';
  }
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
