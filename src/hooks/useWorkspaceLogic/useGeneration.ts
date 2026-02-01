import { type RefObject } from 'react';

import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { type GlossaryItem, type GlossaryExtractionMetadata } from '@/types/glossary';
import { GenerationStatus, type ChunkStatus, type ChunkAnalytics } from '@/types/api';
import { logger } from '@/services/utils/logger';
import { UserActionableError } from '@/services/utils/errors';
import { autoConfirmGlossaryTerms } from '@/services/glossary/autoConfirm';
import { generateSubtitles } from '@/services/generation/pipeline';
import { getActiveGlossaryTerms } from '@/services/glossary/utils';
import { decodeAudioWithRetry } from '@/services/audio/decoder';
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback';
import { ENV } from '@/config';
import * as Sentry from '@sentry/electron/renderer';
import { ExpectedError } from '@/utils/expectedError';
import {
  type GlossaryFlowProps,
  type SnapshotsValuesProps,
  type ProgressHandler,
} from '@/types/workspace';
import { useAppStore } from '@/store/useAppStore';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';

interface UseGenerationProps {
  // Refs
  abortControllerRef: RefObject<AbortController | null>;
  audioCacheRef: RefObject<{ file: File; buffer: AudioBuffer } | null>;

  // External dependency
  handleProgress: ProgressHandler;
  glossaryFlow: GlossaryFlowProps;
  snapshotsValues: Pick<SnapshotsValuesProps, 'setSnapshots' | 'createSnapshot'>;
  setShowSettings: (show: boolean) => void;
}

interface UseGenerationReturn {
  handleGenerate: () => Promise<void>;
}

/**
 * Hook for the core subtitle generation logic.
 * Now reads/writes directly to stores.
 */
export function useGeneration({
  abortControllerRef,
  audioCacheRef,
  handleProgress,
  glossaryFlow,
  snapshotsValues,
  setShowSettings,
}: UseGenerationProps): UseGenerationReturn {
  const { t } = useTranslation(['workspace', 'services']);

  const handleGenerate = useCallback(async () => {
    // Read fresh state/settings
    const settings = useAppStore.getState().settings;
    const { updateSetting, addToast } = useAppStore.getState();
    const {
      file,
      duration,
      batchComments,
      setError,
      setStatus,
      setSubtitles,
      setBatchComments,
      setSelectedBatches,
      setChunkProgress,
      setStartTime,
      speakerProfiles,
      setSpeakerProfiles,
    } = useWorkspaceStore.getState();

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

    // Create a safety snapshot if there are existing subtitles
    const currentSubtitles = useWorkspaceStore.getState().subtitles;
    if (currentSubtitles.length > 0) {
      snapshotsValues.createSnapshot(
        t('services:snapshots.autoBackup', { defaultValue: 'Auto Backup (Before Generation)' }),
        currentSubtitles,
        batchComments,
        `backup-${Date.now()}`,
        file?.name || 'unknown',
        speakerProfiles
      );
    }

    setSubtitles([]);
    // Do NOT clear snapshots - preserve history
    // snapshotsValues.setSnapshots([]);

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
          // File info
          file_ext: file.name.split('.').pop(),
          duration_sec: duration,

          // Core settings
          genre: settings.genre,
          target_language: settings.targetLanguage,
          output_mode: settings.outputMode,

          // Transcription
          model: settings.useLocalWhisper ? 'local' : 'api',

          // Concurrency & Performance
          concurrency_flash: settings.concurrencyFlash,
          concurrency_pro: settings.concurrencyPro,
          concurrency_local: settings.localConcurrency,
          chunk_duration: settings.chunkDuration,
          use_smart_split: settings.useSmartSplit,

          // Batch sizes
          translation_batch_size: settings.translationBatchSize,
          proofread_batch_size: settings.proofreadBatchSize,

          // Alignment
          alignment_mode: settings.alignmentMode,

          // Glossary settings
          enable_auto_glossary: settings.enableAutoGlossary,
          glossary_auto_confirm: settings.glossaryAutoConfirm,
          glossary_sample_minutes: settings.glossarySampleMinutes,
          has_preset_glossary: !!(settings.activeGlossaryId && settings.glossaries?.length),
          preset_glossary_terms_count:
            settings.glossaries?.find((g) => g.id === settings.activeGlossaryId)?.terms?.length ||
            0,

          // Diarization settings
          enable_diarization: settings.enableDiarization,
          enable_speaker_pre_analysis: settings.enableSpeakerPreAnalysis,
          min_speakers: settings.minSpeakers,
          max_speakers: settings.maxSpeakers,
          use_speaker_colors: settings.useSpeakerColors,
          use_speaker_styled_translation: settings.useSpeakerStyledTranslation,

          // Third-party API detection
          is_third_party_gemini: !!(settings.geminiEndpoint && settings.geminiEndpoint !== ''),

          // Has custom prompts
          has_custom_translation_prompt: !!settings.customTranslationPrompt?.trim(),
          has_custom_refinement_prompt: !!settings.customRefinementPrompt?.trim(),
        },
        'interaction'
      );
    }

    // Create new AbortController
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    // Track chunk analytics for reporting on success/failure/cancellation
    let chunkAnalytics: ChunkAnalytics[] = [];

    try {
      setStatus(GenerationStatus.PROCESSING);

      // Prepare runtime settings with active glossary terms
      const runtimeSettings = {
        ...settings,
        glossary: getActiveGlossaryTerms(settings),
      };

      // Prepare audio source: Use cached/decoded buffer for normal mode, or pass raw file for Mock/Debug mode
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

      // Wrap progress handler to collect analytics from all chunks
      const progressWithAnalytics = (update: ChunkStatus) => {
        handleProgress(update);
        // Collect analytics when present (completed, error, or cancelled chunks)
        if (update.analytics) {
          chunkAnalytics.push(update.analytics);
        }
      };

      const {
        subtitles: result,
        chunkAnalytics: resultAnalytics,
        speakerProfiles: updatedProfiles,
      } = await generateSubtitles(
        audioSource,
        duration,
        runtimeSettings,
        progressWithAnalytics,
        (newSubs) => setSubtitles(newSubs),
        // onGlossaryReady callback (Blocking)
        async (metadata: GlossaryExtractionMetadata) => {
          logger.info('onGlossaryReady called with metadata:', metadata);

          if (settings.glossaryAutoConfirm && !metadata.hasFailures) {
            const result = autoConfirmGlossaryTerms({
              metadata,
              settings,
              updateSetting, // Update setting directly via store action
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

            // Track cleanup state to prevent double cleanup
            let cleaned = false;
            const cleanup = () => {
              if (cleaned) return;
              cleaned = true;
              signal?.removeEventListener('abort', onAbort);
              glossaryFlow.setShowGlossaryConfirmation(false);
              glossaryFlow.setShowGlossaryFailure(false);
              glossaryFlow.setPendingGlossaryResults([]);
              glossaryFlow.setGlossaryMetadata(null);
              glossaryFlow.setGlossaryConfirmCallback(null);
            };

            const onAbort = () => {
              logger.info('Glossary confirmation aborted by signal');
              cleanup();
              reject(new Error('Operation cancelled'));
            };

            signal?.addEventListener('abort', onAbort, { once: true });

            logger.info('Setting up UI for manual glossary confirmation...');
            glossaryFlow.setGlossaryMetadata(metadata);

            // Store the resolve function
            glossaryFlow.setGlossaryConfirmCallback(() => (confirmedItems: GlossaryItem[]) => {
              cleanup();
              logger.info('User confirmed glossary terms:', confirmedItems.length);
              // Settings are already updated by GlossaryConfirmationModal
              resolve(confirmedItems);
            });

            if (metadata.totalTerms > 0) {
              glossaryFlow.setPendingGlossaryResults(metadata.results);
              glossaryFlow.setShowGlossaryConfirmation(true);
            } else if (metadata.hasFailures) {
              glossaryFlow.setShowGlossaryFailure(true);
            } else {
              // Should not happen if gemini.ts logic is correct, but safe fallback
              cleanup();
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
        { filename: file.name, duration },
        speakerProfiles,
        // Video path for long video on-demand extraction (Electron only)
        (file as any).path || window.electronAPI?.getFilePath?.(file)
      );

      // Capture analytics for reporting
      chunkAnalytics = resultAnalytics;

      // Then check subtitle results
      if (result.length === 0) {
        // Check if all failures were due to user-actionable errors (e.g., API quota exhausted)
        const failedChunks = chunkAnalytics.filter((c) => c.status === 'failed');
        const allFailuresUserActionable =
          failedChunks.length > 0 && failedChunks.every((c) => c.isUserActionable);

        if (allFailuresUserActionable) {
          // Don't report to Sentry - root cause is user-actionable
          throw new UserActionableError(t('workspace:hooks.generation.errors.noSubtitles'));
        }
        throw new Error(t('workspace:hooks.generation.errors.noSubtitles'));
      }

      setSubtitles(result);
      setSpeakerProfiles(updatedProfiles);
      setStatus(GenerationStatus.COMPLETED);
      // Prioritize manually attached path (from native load) -> Electron webUtils -> filename
      const fileId = file
        ? (file as any).path || window.electronAPI?.getFilePath?.(file) || file.name
        : '';
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
            chunk_durations: chunkAnalytics,
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

        // Ensure analytics are sorted by index
        chunkAnalytics.sort((a, b) => a.index - b.index);

        // Keep partial results (subtitles state already updated via onIntermediateResult)
        // Access latest subtitles from store
        const currentSubtitles = useWorkspaceStore.getState().subtitles;
        if (currentSubtitles.length > 0) {
          const fileId = file ? window.electronAPI?.getFilePath?.(file) || file.name : '';
          const fileName = file?.name || '';
          snapshotsValues.createSnapshot(
            t('services:snapshots.partialGeneration'),
            currentSubtitles,
            batchComments,
            fileId,
            fileName
          );

          addToast(t('workspace:hooks.generation.status.cancelledPartial'), 'warning');
        } else {
          addToast(t('workspace:hooks.generation.status.cancelled'), 'info');
        }

        // Analytics: Cancellation (with partial chunk data)
        if (window.electronAPI?.analytics) {
          void window.electronAPI.analytics.track(
            'workspace_generation_cancelled',
            {
              partial_count: currentSubtitles.length,
              duration_ms: Date.now() - startAt,
              chunk_durations: chunkAnalytics,
            },
            'interaction'
          );
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
              duration_ms: Date.now() - startAt,
              chunk_durations: chunkAnalytics,
            },
            'interaction'
          );
        }

        // Sentry: Report error with context ONLY if not expected
        if (
          !(error instanceof UserActionableError) &&
          !(error instanceof ExpectedError) &&
          !(error as any).isExpected
        ) {
          Sentry.captureException(error, {
            tags: { source: 'workspace_generation' },
          });
        }
      }
    } finally {
      abortControllerRef.current = null;
    }
  }, [
    glossaryFlow,
    snapshotsValues,
    setShowSettings,
    abortControllerRef,
    audioCacheRef,
    handleProgress,
    t,
  ]);

  // 防抖版本的 handleGenerate - 防止快速重复点击
  const debouncedHandleGenerate = useDebouncedCallback(handleGenerate);

  return {
    handleGenerate: debouncedHandleGenerate,
  };
}
