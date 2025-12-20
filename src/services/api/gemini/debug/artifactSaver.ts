import { type SubtitleItem } from '@/types/subtitle';
import { type GlossaryExtractionResult, type GlossaryItem } from '@/types/glossary';
import { type SpeakerProfile } from '@/services/api/gemini/speakerProfile';
import { generateSrtContent } from '@/services/subtitle/generator';
import { logger } from '@/services/utils/logger';
import { type AppSettings } from '@/types/settings';

/**
 * Centralized debug artifact saving utilities
 * All artifact saving goes through window.electronAPI.saveDebugArtifact
 */
export class ArtifactSaver {
  private static isEnabled(settings: AppSettings): boolean {
    return !!(settings.debug?.saveIntermediateArtifacts && window.electronAPI?.saveDebugArtifact);
  }

  /**
   * Save a generic JSON artifact
   */
  static async saveJson(filename: string, data: unknown, settings: AppSettings): Promise<void> {
    if (!this.isEnabled(settings)) return;

    try {
      await window.electronAPI!.saveDebugArtifact(filename, JSON.stringify(data, null, 2));
    } catch (e) {
      logger.warn(`Failed to save artifact: ${filename}`, e);
    }
  }

  /**
   * Save glossary extraction results
   */
  static async saveGlossary(
    finalGlossary: GlossaryItem[],
    rawResults: GlossaryExtractionResult[] | undefined,
    settings: AppSettings
  ): Promise<void> {
    if (!this.isEnabled(settings)) return;

    try {
      await window.electronAPI!.saveDebugArtifact(
        'glossary_final.json',
        JSON.stringify(finalGlossary, null, 2)
      );
      if (rawResults) {
        await window.electronAPI!.saveDebugArtifact(
          'glossary_extraction_raw.json',
          JSON.stringify(rawResults, null, 2)
        );
      }
    } catch (e) {
      logger.warn('Failed to save glossary artifact', e);
    }
  }

  /**
   * Save speaker profiles
   */
  static async saveSpeakerProfiles(
    profiles: SpeakerProfile[],
    settings: AppSettings
  ): Promise<void> {
    if (!this.isEnabled(settings)) return;

    try {
      await window.electronAPI!.saveDebugArtifact(
        'speaker_profiles.json',
        JSON.stringify(profiles, null, 2)
      );
    } catch (e) {
      logger.warn('Failed to save speaker profile artifact', e);
    }
  }

  /**
   * Save chunk-level artifacts (transcription, refinement, translation)
   */
  static saveChunkArtifact(
    chunkIndex: number,
    stage: 'whisper' | 'refinement' | 'translation',
    data: SubtitleItem[],
    settings: AppSettings
  ): void {
    if (!this.isEnabled(settings)) return;

    window
      .electronAPI!.saveDebugArtifact(
        `chunk_${chunkIndex}_${stage}.json`,
        JSON.stringify(data, null, 2)
      )
      .catch((e) => logger.warn(`Failed to save chunk ${chunkIndex} ${stage} artifact`, e));
  }

  /**
   * Save full intermediate SRT files from chunk maps
   */
  static async saveFullIntermediateSrts(
    whisperChunksMap: Map<number, SubtitleItem[]>,
    refinedChunksMap: Map<number, SubtitleItem[]>,
    translatedChunksMap: Map<number, SubtitleItem[]>,
    settings: AppSettings
  ): Promise<void> {
    if (!this.isEnabled(settings)) return;

    try {
      const getSortedSegments = (map: Map<number, SubtitleItem[]>) => {
        return Array.from(map.entries())
          .sort((a, b) => a[0] - b[0])
          .flatMap(([, items]) => items);
      };

      const allWhisper = getSortedSegments(whisperChunksMap);
      const allRefined = getSortedSegments(refinedChunksMap);
      const allTranslated = getSortedSegments(translatedChunksMap);

      if (allWhisper.length > 0) {
        await window.electronAPI!.saveDebugArtifact(
          'full_whisper.srt',
          generateSrtContent(
            allWhisper.map((s) => ({ ...s, translated: s.original })),
            false,
            false
          )
        );
      }

      if (allRefined.length > 0) {
        await window.electronAPI!.saveDebugArtifact(
          'full_refinement.srt',
          generateSrtContent(
            allRefined.map((s) => ({ ...s, translated: s.original })),
            false,
            settings.enableDiarization
          )
        );
      }

      if (allTranslated.length > 0) {
        await window.electronAPI!.saveDebugArtifact(
          'full_translation.srt',
          generateSrtContent(allTranslated, true, settings.enableDiarization)
        );
      }

      logger.info('Saved full intermediate SRT artifacts.');
    } catch (e) {
      logger.warn('Failed to save full intermediate SRTs', e);
    }
  }
}
