import { SubtitleItem } from '@/types/subtitle';

export interface ConsistencyIssue {
  type: 'punctuation' | 'spacing' | 'length' | 'brackets' | 'ai_consistency' | 'other';
  segmentId: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
}

export class ConsistencyValidator {
  /**
   * Run all consistency checks
   */
  public static validate(subtitles: SubtitleItem[]): ConsistencyIssue[] {
    const issues: ConsistencyIssue[] = [];

    subtitles.forEach((sub) => {
      if (!sub.translated) return;

      // 1. Punctuation Check (Simplified Chinese)
      // Check for half-width punctuation that should likely be full-width in Chinese context
      // e.g., comma, period, question mark, exclamation mark
      // Exception: if the text is English or mixed, this might be valid.
      // We assume 'text_translated' is Chinese.

      const halfWidthPunctuation = /[,.?!:;]/g;
      // Filter out common English acronyms or numbers which might use dots/commas
      // This is a naive check; a robust one would check context.

      // Simple heuristic: if the line contains Chinese characters, it should use full-width punctuation
      const hasChinese = /[\u4e00-\u9fa5]/.test(sub.translated);

      if (hasChinese) {
        if (sub.translated.match(/,(?!\d)/)) {
          // Comma not followed by digit
          issues.push({
            type: 'punctuation',
            segmentId: sub.id,
            description: 'Possible half-width comma used in Chinese text',
            severity: 'low',
          });
        }
        if (sub.translated.match(/\.(?!\d)/)) {
          // Dot not followed by digit (and not ellipsis ...)
          // Check if it's not part of "..."
          if (!sub.translated.includes('...')) {
            issues.push({
              type: 'punctuation',
              segmentId: sub.id,
              description: 'Possible half-width period used in Chinese text',
              severity: 'low',
            });
          }
        }
      }

      // 2. Spacing Check
      // Check for missing space between English and Chinese
      // Regex: Chinese followed by English/Number OR English/Number followed by Chinese
      // Note: This is a stylistic choice, but often desired.

      const missingSpace = /([\u4e00-\u9fa5][a-zA-Z0-9])|([a-zA-Z0-9][\u4e00-\u9fa5])/;
      if (missingSpace.test(sub.translated)) {
        issues.push({
          type: 'spacing',
          segmentId: sub.id,
          description: 'Missing space between Chinese and English/Number',
          severity: 'low',
        });
      }

      // 3. Length Check
      // Flag extremely long lines (e.g., > 30 chars)
      if (sub.translated.length > 35) {
        issues.push({
          type: 'length',
          segmentId: sub.id,
          description: 'Line is very long (>35 chars), consider splitting',
          severity: 'medium',
        });
      }

      // 4. Brackets Check
      // Check for mismatched brackets
      const openBrackets = (sub.translated.match(/[（【《]/g) || []).length;
      const closeBrackets = (sub.translated.match(/[）】》]/g) || []).length;

      if (openBrackets !== closeBrackets) {
        issues.push({
          type: 'brackets',
          segmentId: sub.id,
          description: 'Mismatched brackets detected',
          severity: 'medium',
        });
      }
    });

    return issues;
  }
}
