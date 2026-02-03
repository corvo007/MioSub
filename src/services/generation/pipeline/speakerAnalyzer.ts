import { type SpeakerProfile } from '@/services/generation/extractors/speakerProfile';
import { type PipelineContext } from '@/types/pipeline';
import { MockFactory } from '@/services/generation/debug/mockFactory';
import { intelligentAudioSampling } from '@/services/audio/sampler';
import { extractSpeakerProfiles } from '@/services/generation/extractors/speakerProfile';
import { getActionableErrorInfo } from '@/services/llm/providers/gemini';
import { logger } from '@/services/utils/logger';
import * as Sentry from '@sentry/electron/renderer';
import i18n from '@/i18n';

export class SpeakerAnalyzer {
  static async analyze(
    context: PipelineContext,
    audioBuffer: AudioBuffer,
    vadSegments: { start: number; end: number }[] | undefined
  ): Promise<SpeakerProfile[]> {
    const { settings, onProgress, signal, ai, trackUsage, isDebug } = context;

    logger.info('Starting parallel speaker profile extraction...');
    onProgress?.({
      id: 'diarization',
      total: 1,
      status: 'processing',
      message: i18n.t('services:pipeline.status.analyzingSpeakers'),
    });

    try {
      // Mock speaker profiles if any mock stage is enabled
      if (isDebug && settings.debug?.mockApi?.speaker) {
        return MockFactory.getMockSpeakerProfiles();
      }

      // 1. Intelligent Sampling (returns blob and duration)
      const { blob: sampledAudioBlob, duration } = await intelligentAudioSampling(
        audioBuffer,
        480, // 8 minutes for comprehensive speaker coverage
        8,
        signal,
        vadSegments // Pass cached VAD segments to avoid re-running VAD
      );

      // 2. Extract Profiles
      const profileSet = await extractSpeakerProfiles(
        ai,
        sampledAudioBlob,
        duration,
        settings.genre,
        (settings.requestTimeout || 600) * 1000, // Use configured timeout
        trackUsage,
        signal,
        settings.minSpeakers,
        settings.maxSpeakers
      );

      logger.info(`Extracted ${profileSet.profiles.length} speaker profiles`, profileSet.profiles);
      onProgress?.({
        id: 'diarization',
        total: 1,
        status: 'completed',
        message: i18n.t('services:pipeline.status.speakersIdentified', {
          count: profileSet.profiles.length,
        }),
      });

      // Swap ID with Name if available, so the AI uses the name in the output
      return profileSet.profiles.map((p) => ({
        ...p,
        id: p.characteristics.name || p.id,
      }));
    } catch (e: any) {
      logger.error('Speaker profile extraction failed', e);
      // Use actionable error info if available
      const actionableInfo = getActionableErrorInfo(e);
      const errorMsg =
        actionableInfo?.message || i18n.t('services:pipeline.status.speakerAnalysisFailed');
      onProgress?.({ id: 'diarization', total: 1, status: 'error', message: errorMsg });

      // Report to Sentry if not user-actionable
      if (!actionableInfo) {
        Sentry.captureException(e, {
          level: 'warning',
          tags: { source: 'speaker_analyzer' },
          extra: { fallback_used: true },
        });
      }

      return [];
    }
  }
}
