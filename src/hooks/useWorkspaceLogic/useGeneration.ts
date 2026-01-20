import { type RefObject } from 'react';
import type React from 'react';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { type SubtitleItem } from '@/types/subtitle';
import { type AppSettings } from '@/types/settings';
import { type GlossaryItem, type GlossaryExtractionMetadata } from '@/types/glossary';
import { GenerationStatus, type ChunkStatus } from '@/types/api';
import { logger } from '@/services/utils/logger';
import { autoConfirmGlossaryTerms } from '@/services/glossary/autoConfirm';
import { generateSubtitles } from '@/services/generation/pipeline';
import { getActiveGlossaryTerms } from '@/services/glossary/utils';
import { decodeAudioWithRetry } from '@/services/audio/decoder';
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback';
import { ENV } from '@/config';
import {
  type GlossaryFlowProps,
  type SnapshotsValuesProps,
  type ProgressHandler,
} from '@/types/workspace';

interface UseGenerationProps {
  // State reading
  file: File | null;
  duration: number;
  settings: AppSettings;
  batchComments: Record<number, string>;

  // State setters
  setStatus: (status: GenerationStatus) => void;
  setError: (error: string | null) => void;
  setSubtitles: (subtitles: SubtitleItem[]) => void;
  setChunkProgress: React.Dispatch<React.SetStateAction<Record<string, ChunkStatus>>>;
  setStartTime: (time: number | null) => void;
  setSelectedBatches: (batches: Set<number>) => void;
  setBatchComments: React.Dispatch<React.SetStateAction<Record<number, string>>>;

  // Refs
  abortControllerRef: RefObject<AbortController | null>;
  audioCacheRef: RefObject<{ file: File; buffer: AudioBuffer } | null>;
  subtitlesRef: RefObject<SubtitleItem[]>;

  // External dependencies
  handleProgress: ProgressHandler;
  glossaryFlow: GlossaryFlowProps;
  snapshotsValues: Pick<SnapshotsValuesProps, 'setSnapshots' | 'createSnapshot'>;
  addToast: (
    message: string,
    type: 'success' | 'error' | 'info' | 'warning',
    duration?: number
  ) => void;
  setShowSettings: (show: boolean) => void;
  updateSetting: (key: keyof AppSettings, value: unknown) => void;
}

interface UseGenerationReturn {
  handleGenerate: () => Promise<void>;
}

/**
 * Hook for the core subtitle generation logic.
 */
export function useGeneration({
  file,
  duration,
  settings,
  batchComments,
  setStatus,
  setError,
  setSubtitles,
  setChunkProgress,
  setStartTime,
  setSelectedBatches,
  setBatchComments,
  abortControllerRef,
  audioCacheRef,
  subtitlesRef,
  handleProgress,
  glossaryFlow,
  snapshotsValues,
  addToast,
  setShowSettings,
  updateSetting,
}: UseGenerationProps): UseGenerationReturn {
  const { t } = useTranslation(['workspace', 'services']);

  const handleGenerate = useCallback(async () => {
    if (!file) {
      setError(t('workspace:hooks.generation.errors.fileRequired'));
      return;
    }
    const hasGemini = !!(settings.geminiKey || ENV.GEMINI_API_KEY);
    const hasOpenAI = !!(settings.openaiKey || ENV.OPENAI_API_KEY);
    const hasLocalWhisper = !!settings.useLocalWhisper;

    if (!hasGemini || (!hasOpenAI && !hasLocalWhisper)) {
      setError(t('workspace:hooks.generation.errors.apiKeyMissing'));
      setShowSettings(true);
      return;
    }

    if (!settings.targetLanguage) {
      setError(t('workspace:hooks.generation.errors.targetLanguageRequired'));
      addToast(t('workspace:hooks.generation.errors.targetLanguageRequired'), 'error');
      return;
    }
    setStatus(GenerationStatus.UPLOADING);
    setError(null);
    setSubtitles([]);
    snapshotsValues.setSnapshots([]);
    setBatchComments({});
    setSelectedBatches(new Set());
    setChunkProgress({});
    setStartTime(Date.now());
    logger.info('Starting subtitle generation', {
      file: file.name,
      duration,
      settings: { ...settings, geminiKey: '***', openaiKey: '***' },
    });

    // Analytics: Start
    const startAt = Date.now();
    if (window.electronAPI?.analytics) {
      void window.electronAPI.analytics.track(
        'workspace_generation_started',
        {
          file_ext: file.name.split('.').pop(),
          duration_sec: duration,
          target_language: settings.targetLanguage,
          model: settings.useLocalWhisper ? 'local' : 'api',
          enable_auto_glossary: settings.enableAutoGlossary,
          glossary_auto_confirm: settings.glossaryAutoConfirm,
          enable_diarization: settings.enableDiarization,
          enable_speaker_pre_analysis: settings.enableSpeakerPreAnalysis,
          min_speakers: settings.minSpeakers,
          max_speakers: settings.maxSpeakers,
          use_speaker_colors: settings.useSpeakerColors,
          use_speaker_styled_translation: settings.useSpeakerStyledTranslation,
          output_mode: settings.outputMode,
        },
        'interaction'
      );
    }

    // Create new AbortController
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    try {
      setStatus(GenerationStatus.PROCESSING);

      // Prepare runtime settings with active glossary terms
      const runtimeSettings = {
        ...settings,
        glossary: getActiveGlossaryTerms(settings),
      };

      // Prepare audio source: Use cached/decoded buffer for normal mode, or pass raw file for Mock/Debug mode
      // (This allows pipeline/index.ts to decide if decoding is even necessary, e.g. satisfying "Start From: Refinement" optimization)
      let audioSource: AudioBuffer | File;
      const isMockMode = !!settings.debug?.mockStage;

      if (isMockMode) {
        audioSource = file;
        logger.info(
          'Debug/Mock mode detected: Skipping eager audio decoding in workspace. Delegating to pipeline.'
        );
      } else {
        // Normal mode: Decode eagerley to support caching and retry without re-decoding
        try {
          if (audioCacheRef.current && audioCacheRef.current.file === file) {
            audioSource = audioCacheRef.current.buffer;
          } else {
            handleProgress({
              id: 'decoding',
              total: 1,
              status: 'processing',
              message: t('services:pipeline.status.decoding'),
            });
            const buffer = await decodeAudioWithRetry(file);
            audioCacheRef.current = { file, buffer };
            audioSource = buffer;
          }
        } catch (e) {
          logger.error('Failed to decode audio in handleGenerate', e);
          throw new Error(t('services:pipeline.errors.decodeFailed'));
        }
      }

      const { subtitles: result } = await generateSubtitles(
        audioSource,
        duration,
        runtimeSettings,
        handleProgress,
        (newSubs) => setSubtitles(newSubs),
        // onGlossaryReady callback (Blocking)
        async (metadata: GlossaryExtractionMetadata) => {
          logger.info('onGlossaryReady called with metadata:', metadata);

          if (settings.glossaryAutoConfirm && !metadata.hasFailures) {
            const result = autoConfirmGlossaryTerms({
              metadata,
              settings,
              updateSetting,
              logPrefix: '[Workspace]',
            });
            return result.terms;
          }

          // Manual confirmation required
          return new Promise<GlossaryItem[]>((resolve, reject) => {
            // Check if already aborted
            if (signal?.aborted) {
              reject(new Error('Operation cancelled'));
              return;
            }

            const onAbort = () => {
              logger.info('Glossary confirmation aborted by signal');
              // Cleanup UI
              glossaryFlow.setShowGlossaryConfirmation(false);
              glossaryFlow.setShowGlossaryFailure(false);
              glossaryFlow.setPendingGlossaryResults([]);
              glossaryFlow.setGlossaryMetadata(null);
              glossaryFlow.setGlossaryConfirmCallback(null);
              reject(new Error('Operation cancelled'));
            };

            signal?.addEventListener('abort', onAbort);

            logger.info('Setting up UI for manual glossary confirmation...');
            glossaryFlow.setGlossaryMetadata(metadata);

            // Store the resolve function
            glossaryFlow.setGlossaryConfirmCallback(() => (confirmedItems: GlossaryItem[]) => {
              signal?.removeEventListener('abort', onAbort);
              logger.info('User confirmed glossary terms:', confirmedItems.length);
              // Settings are already updated by GlossaryConfirmationModal

              // Cleanup UI
              glossaryFlow.setShowGlossaryConfirmation(false);
              glossaryFlow.setShowGlossaryFailure(false);
              glossaryFlow.setPendingGlossaryResults([]);
              glossaryFlow.setGlossaryMetadata(null);
              glossaryFlow.setGlossaryConfirmCallback(null);

              resolve(confirmedItems);
            });

            if (metadata.totalTerms > 0) {
              glossaryFlow.setPendingGlossaryResults(metadata.results);
              glossaryFlow.setShowGlossaryConfirmation(true);
            } else if (metadata.hasFailures) {
              glossaryFlow.setShowGlossaryFailure(true);
            } else {
              // Should not happen if gemini.ts logic is correct, but safe fallback
              signal?.removeEventListener('abort', onAbort);
              if (settings.activeGlossaryId && settings.glossaries) {
                const activeG = settings.glossaries.find((g) => g.id === settings.activeGlossaryId);
                resolve(activeG?.terms || []);
              } else {
                resolve(getActiveGlossaryTerms(settings));
              }
            }
          });
        },
        signal,
        // Video info for artifact metadata
        { filename: file.name, duration }
      );

      // Then check subtitle results
      if (result.length === 0) throw new Error(t('workspace:hooks.generation.errors.noSubtitles'));

      setSubtitles(result);
      setStatus(GenerationStatus.COMPLETED);
      const fileId = file ? window.electronAPI?.getFilePath?.(file) || file.name : '';
      const fileName = file?.name || '';
      snapshotsValues.createSnapshot(
        t('services:snapshots.initialGeneration'),
        result,
        {},
        fileId,
        fileName
      );

      logger.info('Subtitle generation completed', { count: result.length });

      // Analytics: Success
      if (window.electronAPI?.analytics) {
        void window.electronAPI.analytics.track(
          'workspace_generation_completed',
          {
            count: result.length,
            duration_ms: Date.now() - startAt,
          },
          'interaction'
        );
      }

      addToast(t('workspace:hooks.generation.status.success'), 'success');
    } catch (err: unknown) {
      const error = err as Error;
      // Check if it was a cancellation
      if (
        error.name === 'AbortError' ||
        error.message === t('services:pipeline.errors.cancelled') ||
        signal.aborted
      ) {
        setStatus(GenerationStatus.CANCELLED);
        logger.info('Generation cancelled by user');

        // Keep partial results (subtitles state already updated via onIntermediateResult)
        if (subtitlesRef.current.length > 0) {
          const fileId = file ? window.electronAPI?.getFilePath?.(file) || file.name : '';
          const fileName = file?.name || '';
          snapshotsValues.createSnapshot(
            t('services:snapshots.partialGeneration'),
            subtitlesRef.current,
            batchComments,
            fileId,
            fileName
          );

          addToast(t('workspace:hooks.generation.status.cancelledPartial'), 'warning');
        } else {
          addToast(t('workspace:hooks.generation.status.cancelled'), 'info');
        }
      } else {
        setStatus(GenerationStatus.ERROR);
        setError(error.message);
        logger.error('Subtitle generation failed', err);
        addToast(t('workspace:hooks.generation.status.failed', { error: error.message }), 'error');

        // Analytics: Error
        if (window.electronAPI?.analytics) {
          void window.electronAPI.analytics.track(
            'workspace_generation_failed',
            {
              error: error.message,
            },
            'interaction'
          );
        }
      }
    } finally {
      abortControllerRef.current = null;
    }
  }, [
    file,
    settings,
    duration,
    glossaryFlow,
    snapshotsValues,
    updateSetting,
    addToast,
    setShowSettings,
    batchComments,
    abortControllerRef,
    audioCacheRef,
    subtitlesRef,
    handleProgress,
    setStatus,
    setError,
    setSubtitles,
    setChunkProgress,
    setStartTime,
    setSelectedBatches,
    setBatchComments,
    t,
  ]);

  // 防抖版本的 handleGenerate - 防止快速重复点击
  const debouncedHandleGenerate = useDebouncedCallback(handleGenerate);

  return {
    handleGenerate: debouncedHandleGenerate,
  };
}
