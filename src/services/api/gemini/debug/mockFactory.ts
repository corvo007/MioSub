import { type SubtitleItem } from '@/types/subtitle';
import { type GlossaryExtractionResult } from '@/types/glossary';
import { type SpeakerProfile } from '@/services/api/gemini/speakerProfile';
import { logger } from '@/services/utils/logger';
import { generateSubtitleId } from '@/services/utils/id';
import { formatTime } from '@/services/subtitle/time';

/**
 * Centralized factory for generating mock data during debug mode
 * Reduces clutter in the main pipeline
 */
export class MockFactory {
  static async getMockGlossary(chunkIndex: number = 0): Promise<GlossaryExtractionResult[]> {
    const mockGlossary = [
      {
        chunkIndex,
        terms: [
          {
            term: 'Mock Term',
            translation: '模拟术语',
            notes: 'Mock notes for validation',
          } as any,
        ],
        confidence: 'high' as const,
        source: 'chunk' as const,
      },
    ];
    logger.info('⚠️ [MOCK] Glossary Extraction ENABLED. Returning mock data:', mockGlossary);
    return mockGlossary;
  }

  static async getMockSpeakerProfiles(): Promise<SpeakerProfile[]> {
    logger.info('⚠️ [MOCK] Speaker Profile Analysis ENABLED. Returning mock profiles.');
    await new Promise((resolve) => setTimeout(resolve, 1000));

    return [
      {
        id: 'Mock Speaker 1',
        characteristics: {
          name: 'Mock Speaker 1',
          gender: 'male',
          pitch: 'medium',
          speed: 'normal',
          accent: 'standard',
          tone: 'neutral',
        },
        sampleQuotes: ['This is a mock quote for speaker 1.'],
        confidence: 0.95,
      },
      {
        id: 'Mock Speaker 2',
        characteristics: {
          name: 'Mock Speaker 2',
          gender: 'female',
          pitch: 'high',
          speed: 'fast',
          accent: 'standard',
          tone: 'energetic',
        },
        sampleQuotes: ['This is a mock quote for speaker 2.'],
        confidence: 0.88,
      },
    ];
  }

  static async getMockTranscription(
    chunkIndex: number,
    start: number,
    end: number
  ): Promise<SubtitleItem[]> {
    const mockTranscription = [
      {
        id: generateSubtitleId(),
        startTime: '00:00:00,000',
        endTime: formatTime(end - start),
        original: `[Mock] Transcription for Chunk ${chunkIndex}`,
        translated: '',
      },
    ];
    logger.info(
      `⚠️ [MOCK] Transcription ENABLED for Chunk ${chunkIndex}. Returning mock data:`,
      mockTranscription
    );
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return mockTranscription;
  }

  static async getMockRefinement(
    chunkIndex: number,
    rawSegments: SubtitleItem[]
  ): Promise<SubtitleItem[]> {
    logger.info(
      `⚠️ [MOCK] Refinement ENABLED for Chunk ${chunkIndex}. Returning raw segments as refined.`
    );
    await new Promise((resolve) => setTimeout(resolve, 500));
    return [...rawSegments];
  }

  static async getMockTranslation(chunkIndex: number, toTranslate: any[]): Promise<SubtitleItem[]> {
    logger.info(
      `⚠️ [MOCK] Translation ENABLED for Chunk ${chunkIndex}. Generating mock translations.`
    );
    await new Promise((resolve) => setTimeout(resolve, 500));
    const translatedItems = toTranslate.map((t) => ({
      ...t,
      translated: `[Mock] Translated: ${t.original}`,
    }));
    logger.info(`⚠️ [MOCK] Translation Result for Chunk ${chunkIndex}:`, translatedItems);

    return translatedItems as any;
  }
}
