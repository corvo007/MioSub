import { type SpeakerProfile } from '@/services/api/gemini/speakerProfile';
import { type PipelineContext } from './types';
import { MockFactory } from '@/services/api/gemini/debug/mockFactory';
import { intelligentAudioSampling } from '@/services/audio/sampler';
import { extractSpeakerProfiles } from '@/services/api/gemini/speakerProfile';
import { getActionableErrorMessage } from '@/services/api/gemini/client';
import { logger } from '@/services/utils/logger';

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
      message: '正在分析说话人...',
    });

    try {
      if (isDebug && settings.debug?.mockGemini) {
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
        message: `已识别 ${profileSet.profiles.length} 位说话人`,
      });

      // Swap ID with Name if available, so the AI uses the name in the output
      return profileSet.profiles.map((p) => ({
        ...p,
        id: p.characteristics.name || p.id,
      }));
    } catch (e: any) {
      logger.error('Speaker profile extraction failed', e);
      // Use actionable error message if available
      const actionableMsg = getActionableErrorMessage(e);
      const errorMsg = actionableMsg || '说话人预分析失败';
      onProgress?.({ id: 'diarization', total: 1, status: 'error', message: errorMsg });
      return [];
    }
  }
}
