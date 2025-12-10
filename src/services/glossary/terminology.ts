import { SubtitleItem } from '@/types/subtitle';
import { GlossaryItem } from '@/types/glossary';
import { logger } from '@/services/utils/logger';

export interface TerminologyIssue {
  term: string;
  expected: string;
  occurrences: {
    segmentId: string;
    text: string;
    found: string;
  }[];
}

export class TerminologyChecker {
  private glossary: GlossaryItem[] = [];

  constructor(initialGlossary: GlossaryItem[] = []) {
    this.glossary = initialGlossary;
  }

  public setGlossary(glossary: GlossaryItem[]) {
    this.glossary = glossary;
  }

  public getGlossary(): GlossaryItem[] {
    return this.glossary;
  }

  public addTerm(term: string, translation: string, notes?: string) {
    // Check if term exists, update if so
    const index = this.glossary.findIndex((g) => g.term.toLowerCase() === term.toLowerCase());
    if (index >= 0) {
      this.glossary[index] = { term, translation, notes };
    } else {
      this.glossary.push({ term, translation, notes });
    }
    logger.debug(`Added term to glossary: ${term} -> ${translation}`);
  }

  public removeTerm(term: string) {
    this.glossary = this.glossary.filter((g) => g.term.toLowerCase() !== term.toLowerCase());
    logger.debug(`Removed term from glossary: ${term}`);
  }

  /**
   * Check subtitles for terminology inconsistencies
   */
  public check(subtitles: SubtitleItem[]): TerminologyIssue[] {
    logger.info(
      `Checking terminology for ${subtitles.length} subtitles against ${this.glossary.length} terms`
    );
    const issues: TerminologyIssue[] = [];

    for (const item of this.glossary) {
      const termRegex = new RegExp(item.term, 'gi');
      const occurrences: TerminologyIssue['occurrences'] = [];

      subtitles.forEach((sub) => {
        // Check if the source term appears in the original text (optional, but good for context)
        // OR check if the *translation* matches the expected translation

        // Strategy:
        // 1. If source text contains the term...
        // 2. Check if translated text contains the expected translation.

        // Note: This requires the source text to be available and the term to be in the source language.
        // If the glossary is Source -> Target, we check:
        // Does Source contain Term? Yes -> Does Target contain Translation? No -> Issue.

        if (sub.original && sub.original.match(termRegex)) {
          // Check if translation contains the expected target term
          if (sub.translated && !sub.translated.includes(item.translation)) {
            occurrences.push({
              segmentId: sub.id,
              text: sub.translated,
              found: 'Missing: ' + item.translation,
            });
          }
        }
      });

      if (occurrences.length > 0) {
        issues.push({
          term: item.term,
          expected: item.translation,
          occurrences,
        });
      }
    }

    return issues;
  }
}
