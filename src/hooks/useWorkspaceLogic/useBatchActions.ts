import { type RefObject } from 'react';
import type React from 'react';
import { useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type SubtitleItem,
  type BatchOperationMode,
  type RegeneratePrompts,
} from '@/types/subtitle';
import { type SpeakerUIProfile } from '@/types/speaker';
import { type AppSettings } from '@/types/settings';
import { GenerationStatus, type ChunkStatus } from '@/types/api';
import { generateSrtContent, generateAssContent } from '@/services/subtitle/generator';
import { downloadFile } from '@/services/subtitle/downloader';
import { logger } from '@/services/utils/logger';
import { runProofreadOperation } from '@/services/generation/batch/proofread';
import { runRegenerateOperation } from '@/services/generation/batch/regenerate';
import { getActiveGlossaryTerms } from '@/services/glossary/utils';
import { retryGlossaryExtraction } from '@/services/generation/extractors/glossary';
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback';
import { ENV } from '@/config';
import {
  type GlossaryFlowProps,
  type SnapshotsValuesProps,
  type ProgressHandler,
} from '@/types/workspace';

interface UseBatchActionsProps {
  // State reading
  file: File | null;
  subtitles: SubtitleItem[];
  selectedBatches: Set<number>;
  batchComments: Record<number, string>;
  settings: AppSettings;
  speakerProfiles?: SpeakerUIProfile[];

  // State setters
  setSubtitles: (subtitles: SubtitleItem[]) => void;
  setSelectedBatches: (batches: Set<number>) => void;
  setBatchComments: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  setStatus: (status: GenerationStatus) => void;
  setError: (error: string | null) => void;
  setChunkProgress: React.Dispatch<React.SetStateAction<Record<string, ChunkStatus>>>;
  setStartTime: (time: number | null) => void;

  // Refs
  abortControllerRef: RefObject<AbortController | null>;
  audioCacheRef: RefObject<{ file: File; buffer: AudioBuffer } | null>;

  // External dependencies
  handleProgress: ProgressHandler;
  glossaryFlow: GlossaryFlowProps;
  snapshotsValues: Pick<SnapshotsValuesProps, 'createSnapshot'>;
  addToast: (
    message: string,
    type: 'success' | 'error' | 'info' | 'warning',
    duration?: number
  ) => void;
}

interface UseBatchActionsReturn {
  handleBatchAction: (
    mode: BatchOperationMode,
    singleIndex?: number,
    prompts?: RegeneratePrompts
  ) => Promise<void>;
  handleDownload: (format: 'srt' | 'ass') => void;
  handleRetryGlossary: () => Promise<void>;
}

/**
 * Hook for batch operations, download, and glossary retry.
 */
export function useBatchActions({
  file,
  subtitles,
  selectedBatches,
  batchComments,
  settings,
  speakerProfiles,
  setSubtitles,
  setSelectedBatches,
  setBatchComments,
  setStatus,
  setError,
  setChunkProgress,
  setStartTime,
  abortControllerRef,
  audioCacheRef,
  handleProgress,
  glossaryFlow,
  snapshotsValues,
  addToast,
}: UseBatchActionsProps): UseBatchActionsReturn {
  const { t } = useTranslation(['workspace', 'services']);
  // Use ref instead of state to avoid closure issues in async catch block
  const snapshotBeforeOperationRef = useRef<SubtitleItem[] | null>(null);

  const handleBatchAction = useCallback(
    async (mode: BatchOperationMode, singleIndex?: number, prompts?: RegeneratePrompts) => {
      const indices: number[] =
        singleIndex !== undefined ? [singleIndex] : (Array.from(selectedBatches) as number[]);
      if (indices.length === 0) return;
      if (!settings.geminiKey && !ENV.GEMINI_API_KEY) {
        setError(t('services:pipeline.errors.missingGeminiKey'));
        return;
      }
      if (mode === 'regenerate' && !file) {
        setError(t('workspace:hooks.batch.errors.regenerate.audioRequired'));
        return;
      }

      // Save current state BEFORE operation (use ref for fresh value in catch block)
      snapshotBeforeOperationRef.current = [...subtitles];

      // Create snapshot BEFORE AI operation for user recovery
      const actionName =
        mode === 'regenerate'
          ? t('workspace:hooks.batch.actions.regenerate')
          : t('workspace:hooks.batch.actions.refineTranslation');
      const fileId = file ? window.electronAPI?.getFilePath?.(file) || file.name : '';
      const fileName = file?.name || '';
      snapshotsValues.createSnapshot(
        t('workspace:hooks.batch.snapshot.backupSuffix', { action: actionName }),
        subtitles,
        batchComments,
        fileId,
        fileName,
        speakerProfiles
      );

      // Create new AbortController
      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;

      setStatus(GenerationStatus.PROOFREADING);
      setError(null);
      setChunkProgress({});
      setStartTime(Date.now());
      logger.info(`Starting batch action: ${mode}`, { indices, mode });

      // Analytics: Batch Action Started
      if (window.electronAPI?.analytics) {
        void window.electronAPI.analytics.track(
          'batch_action_started',
          {
            action: mode === 'regenerate' ? 'regenerate' : 'refine_translation',
            count: indices.length,
            file_name: fileName,
          },
          'interaction'
        );
      }

      try {
        let refined: SubtitleItem[];

        if (mode === 'regenerate') {
          // Use the new regenerate operation for full pipeline re-run
          refined = await runRegenerateOperation(
            file!,
            subtitles,
            indices,
            settings,
            prompts || {},
            undefined, // speakerProfiles - regenerate will use existing context
            settings.glossary,
            handleProgress,
            signal
          );
        } else {
          // Use existing proofread operation
          refined = await runProofreadOperation(
            file,
            subtitles,
            indices,
            settings,
            mode,
            batchComments,
            handleProgress,
            signal
          );
        }
        setSubtitles(refined);
        setStatus(GenerationStatus.COMPLETED);
        setBatchComments((prev) => {
          const next = { ...prev };
          indices.forEach((idx) => delete next[idx]);
          return next;
        });
        if (singleIndex === undefined) setSelectedBatches(new Set());
        logger.info(`Batch action ${mode} completed`);
        addToast(t('workspace:hooks.batch.status.completed', { action: actionName }), 'success');
      } catch (err: unknown) {
        const error = err as Error;
        // Check if it was a cancellation
        if (error.message === 'Operation cancelled' || signal.aborted) {
          setStatus(GenerationStatus.CANCELLED);
          logger.info('Batch operation cancelled by user');

          // Restore from snapshot (read from ref for fresh value)
          if (snapshotBeforeOperationRef.current) {
            setSubtitles(snapshotBeforeOperationRef.current);
            addToast(t('workspace:hooks.batch.status.cancelledRestore'), 'warning');
          } else {
            addToast(t('workspace:hooks.batch.status.cancelled'), 'info');
          }
        } else {
          setStatus(GenerationStatus.ERROR);
          setError(t('workspace:hooks.batch.status.failed', { error: error.message }));
          logger.error(`Batch action ${mode} failed`, err);
          addToast(t('workspace:hooks.batch.status.failed', { error: error.message }), 'error');
        }
      } finally {
        abortControllerRef.current = null;
        snapshotBeforeOperationRef.current = null;
      }
    },
    [
      file,
      subtitles,
      selectedBatches,
      settings,
      batchComments,
      speakerProfiles,
      snapshotsValues,
      addToast,

      abortControllerRef,
      handleProgress,
      t,
      setSubtitles,
      setSelectedBatches,
      setBatchComments,
      setStatus,
      setError,
      setChunkProgress,
      setStartTime,
    ]
  );

  const handleDownload = useCallback(
    (format: 'srt' | 'ass') => {
      if (subtitles.length === 0) return;
      const isBilingual = settings.outputMode === 'bilingual';
      const includeSpeaker = settings.includeSpeakerInExport || false;
      const content =
        format === 'srt'
          ? generateSrtContent(subtitles, isBilingual, includeSpeaker)
          : generateAssContent(
              subtitles,
              file ? file.name : 'video',
              isBilingual,
              includeSpeaker,
              settings.useSpeakerColors,
              speakerProfiles
            );
      const filename = file ? file.name.replace(/\.[^/.]+$/, '') : 'subtitles';
      logger.info(`Downloading subtitles: ${filename}.${format}`);

      // Analytics: Subtitle Exported
      if (window.electronAPI?.analytics) {
        void window.electronAPI.analytics.track(
          'editor_exported',
          {
            format: format,
            count: subtitles.length,
          },
          'interaction'
        );
      }

      void downloadFile(`${filename}.${format}`, content, format);
    },
    [
      subtitles,
      settings.outputMode,
      settings.includeSpeakerInExport,
      settings.useSpeakerColors,
      file,
      speakerProfiles,
    ]
  );

  const handleRetryGlossary = useCallback(async () => {
    if (!glossaryFlow.glossaryMetadata?.glossaryChunks || !audioCacheRef.current) return;

    glossaryFlow.setIsGeneratingGlossary(true);
    try {
      const apiKey = settings.geminiKey || ENV.GEMINI_API_KEY;
      const newMetadata = await retryGlossaryExtraction(
        apiKey,
        audioCacheRef.current.buffer,
        glossaryFlow.glossaryMetadata.glossaryChunks,
        settings.genre,
        settings.concurrencyPro,
        settings.geminiEndpoint,
        (settings.requestTimeout || 600) * 1000
      );

      glossaryFlow.setGlossaryMetadata(newMetadata);
      if (newMetadata.totalTerms > 0 || newMetadata.hasFailures) {
        if (newMetadata.totalTerms > 0) {
          glossaryFlow.setPendingGlossaryResults(newMetadata.results);
          glossaryFlow.setShowGlossaryConfirmation(true);
          glossaryFlow.setShowGlossaryFailure(false);
        } else {
          glossaryFlow.setShowGlossaryFailure(true); // Still failed
        }
      } else {
        // Empty results, no failure
        if (glossaryFlow.glossaryConfirmCallback) {
          glossaryFlow.glossaryConfirmCallback(getActiveGlossaryTerms(settings));
          glossaryFlow.setGlossaryConfirmCallback(null);
        }
        glossaryFlow.setShowGlossaryFailure(false);
        glossaryFlow.setGlossaryMetadata(null);
      }
    } catch (e) {
      logger.error('Retry failed', e);
      setError('Retry failed: ' + (e as Error).message);
    } finally {
      glossaryFlow.setIsGeneratingGlossary(false);
    }
  }, [glossaryFlow, settings, audioCacheRef, setError]);

  // 防抖版本 - 防止快速重复点击润色/重新生成按钮
  const debouncedHandleBatchAction = useDebouncedCallback(handleBatchAction);

  return {
    handleBatchAction: debouncedHandleBatchAction,
    handleDownload,
    handleRetryGlossary,
  };
}
