import { type SubtitleItem } from '@/types/subtitle';
import { type GlossaryExtractionResult, type GlossaryItem } from '@/types/glossary';
import { type SpeakerProfile } from '@/services/generation/extractors/speakerProfile';
import {
  type VideoInfo,
  type ArtifactMetadata,
  type ChunkInfo,
  type PipelineInfo,
} from '@/types/artifact';
import { generateSrtContent } from '@/services/subtitle/generator';
import { logger } from '@/services/utils/logger';
import { type AppSettings } from '@/types/settings';
import { formatTime } from '@/services/subtitle/time';

/** Current artifact schema version */
const ARTIFACT_VERSION = '1.0.0';

/** Options for chunk artifact saving */
export interface ChunkArtifactOptions {
  chunkIndex: number;
  stage: 'whisper' | 'refinement' | 'alignment' | 'translation';
  chunkStart?: number;
  chunkEnd?: number;
  videoInfo?: VideoInfo;
}

/** Options for full SRT artifact saving */
export interface FullSrtArtifactOptions {
  videoInfo?: VideoInfo;
  totalChunks?: number;
}

/**
 * Centralized debug artifact saving utilities
 * All artifact saving goes through window.electronAPI.saveDebugArtifact
 */
export class ArtifactSaver {
  private static isEnabled(settings: AppSettings): boolean {
    return !!(settings.debug?.saveIntermediateArtifacts && window.electronAPI?.saveDebugArtifact);
  }

  /**
   * Build metadata for chunk-level artifacts
   */
  private static buildChunkMetadata(
    options: ChunkArtifactOptions,
    segmentCount: number,
    settings: AppSettings
  ): ArtifactMetadata {
    const chunk: ChunkInfo | undefined =
      options.chunkStart !== undefined && options.chunkEnd !== undefined
        ? {
            index: options.chunkIndex,
            start: options.chunkStart,
            end: options.chunkEnd,
            duration: options.chunkEnd - options.chunkStart,
          }
        : undefined;

    const pipeline: PipelineInfo = {
      stage: options.stage,
      timeFormat: 'relative',
      segmentCount,
      settings: {
        alignmentMode: settings.alignmentMode,
        enableDiarization: settings.enableDiarization,
        transcriptionModel: settings.transcriptionModel,
      },
    };

    return {
      version: ARTIFACT_VERSION,
      timestamp: new Date().toISOString(),
      video: options.videoInfo,
      chunk,
      pipeline,
    };
  }

  /**
   * Build SRT header with metadata as NOTE comments
   */
  private static buildSrtHeader(
    stage: string,
    segmentCount: number,
    options?: FullSrtArtifactOptions
  ): string {
    const lines: string[] = [];
    lines.push(`NOTE Gemini Subtitle Pro v${ARTIFACT_VERSION}`);

    if (options?.videoInfo) {
      const duration = formatTime(options.videoInfo.duration);
      lines.push(`NOTE Video: ${options.videoInfo.filename} | Duration: ${duration}`);
    }

    lines.push(`NOTE Generated: ${new Date().toISOString()}`);

    const chunksInfo = options?.totalChunks ? ` | Chunks: ${options.totalChunks}` : '';
    lines.push(`NOTE Stage: ${stage}${chunksInfo} | Segments: ${segmentCount}`);
    lines.push(''); // Empty line before content

    return lines.join('\n');
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
   * Now includes metadata wrapper for debugging context
   */
  static saveChunkArtifact(
    chunkIndex: number,
    stage: 'whisper' | 'refinement' | 'alignment' | 'translation',
    data: SubtitleItem[],
    settings: AppSettings,
    options?: Partial<ChunkArtifactOptions>
  ): void {
    if (!this.isEnabled(settings)) return;

    const fullOptions: ChunkArtifactOptions = {
      chunkIndex,
      stage,
      ...options,
    };

    const metadata = this.buildChunkMetadata(fullOptions, data.length, settings);
    const artifact = {
      _metadata: metadata,
      segments: data,
    };

    window
      .electronAPI!.saveDebugArtifact(
        `chunk_${chunkIndex}_${stage}.json`,
        JSON.stringify(artifact, null, 2)
      )
      .catch((e) => logger.warn(`Failed to save chunk ${chunkIndex} ${stage} artifact`, e));
  }

  /**
   * Save full intermediate SRT files from chunk maps
   * Now includes NOTE header with metadata for debugging context
   */
  static async saveFullIntermediateSrts(
    whisperChunksMap: Map<number, SubtitleItem[]>,
    refinedChunksMap: Map<number, SubtitleItem[]>,
    alignedChunksMap: Map<number, SubtitleItem[]>,
    translatedChunksMap: Map<number, SubtitleItem[]>,
    settings: AppSettings,
    options?: FullSrtArtifactOptions
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
      const allAligned = getSortedSegments(alignedChunksMap);
      const allTranslated = getSortedSegments(translatedChunksMap);

      if (allWhisper.length > 0) {
        const header = this.buildSrtHeader('whisper', allWhisper.length, options);
        const content = generateSrtContent(
          allWhisper.map((s) => ({ ...s, translated: s.original })),
          false,
          false
        );
        await window.electronAPI!.saveDebugArtifact('full_whisper.srt', header + content);
      }

      if (allRefined.length > 0) {
        const header = this.buildSrtHeader('refinement', allRefined.length, options);
        const content = generateSrtContent(
          allRefined.map((s) => ({ ...s, translated: s.original })),
          false,
          settings.enableDiarization
        );
        await window.electronAPI!.saveDebugArtifact('full_refinement.srt', header + content);
      }

      if (allAligned.length > 0) {
        const header = this.buildSrtHeader('alignment', allAligned.length, options);
        const content = generateSrtContent(
          allAligned.map((s) => ({ ...s, translated: s.original })),
          false,
          settings.enableDiarization
        );
        await window.electronAPI!.saveDebugArtifact('full_aligned.srt', header + content);
      }

      if (allTranslated.length > 0) {
        const header = this.buildSrtHeader('translation', allTranslated.length, options);
        const content = generateSrtContent(allTranslated, true, settings.enableDiarization);
        await window.electronAPI!.saveDebugArtifact('full_translation.srt', header + content);
      }

      logger.info('Saved full intermediate SRT artifacts.');
    } catch (e) {
      logger.warn('Failed to save full intermediate SRTs', e);
    }
  }
}
