import React, { useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { type SubtitleItem, type SubtitleSnapshot } from '@/types/subtitle';
import {
  type GlossaryItem,
  type GlossaryExtractionResult,
  type GlossaryExtractionMetadata,
} from '@/types/glossary';
import { GenerationStatus } from '@/types/api';
import { logger } from '@/services/utils/logger';
import { getFilename } from '@/services/utils/path';

// Extracted hooks
import { useSpeakerProfiles } from './useSpeakerProfiles';
import { useBatchSelection } from './useBatchSelection';
import { useSubtitleCRUD } from './useSubtitleCRUD';
import { useAutoSave } from './useAutoSave';
import { useFileOperations } from './useFileOperations';
import { useGeneration } from './useGeneration';
import { useBatchActions } from './useBatchActions';

// Workers
import { useFileParserWorker } from '@/hooks/useFileParserWorker';

interface UseWorkspaceLogicProps {
  // settings and updateSetting removed - unused and available via store if needed
  addToast: (
    message: string,
    type: 'success' | 'error' | 'info' | 'warning',
    duration?: number
  ) => void;
  showConfirm: (
    title: string,
    message: string,
    onConfirm: () => void,
    type?: 'info' | 'warning' | 'danger'
  ) => void;
  glossaryFlow: {
    glossaryMetadata: GlossaryExtractionMetadata | null;
    setGlossaryMetadata: (data: GlossaryExtractionMetadata | null) => void;
    setPendingGlossaryResults: (results: GlossaryExtractionResult[]) => void;
    setShowGlossaryConfirmation: (show: boolean) => void;
    setShowGlossaryFailure: (show: boolean) => void;
    glossaryConfirmCallback: ((items: GlossaryItem[]) => void) | null;
    setGlossaryConfirmCallback: (cb: ((items: GlossaryItem[]) => void) | null) => void;
    setIsGeneratingGlossary: (isGenerating: boolean) => void;
  };
  snapshotsValues: {
    setSnapshots: (snapshots: SubtitleSnapshot[]) => void;
    createSnapshot: (
      description: string,
      subtitles: SubtitleItem[],
      batchComments?: Record<number, string>,
      fileId?: string,
      fileName?: string,
      speakerProfiles?: any
    ) => void;
    createAutoSaveSnapshot: (
      subtitles: SubtitleItem[],
      batchComments: Record<number, string>,
      fileId?: string,
      fileName?: string
    ) => boolean;
    deleteSnapshot: (id: string) => void;
  };
  setShowSettings: (show: boolean) => void;
}

import { useWorkspaceStore } from '@/store/useWorkspaceStore';

export const useWorkspaceLogic = ({
  addToast,
  showConfirm,
  glossaryFlow,
  snapshotsValues,
  setShowSettings,
}: UseWorkspaceLogicProps) => {
  const { t } = useTranslation('workspace');

  // ============================================
  // Core State (Read from Store)
  // ============================================
  const file = useWorkspaceStore((state) => state.file);
  const duration = useWorkspaceStore((state) => state.duration);
  const status = useWorkspaceStore((state) => state.status);
  const progressMsg = useWorkspaceStore((state) => state.progressMsg);
  const chunkProgress = useWorkspaceStore((state) => state.chunkProgress);
  const subtitles = useWorkspaceStore((state) => state.subtitles);
  const error = useWorkspaceStore((state) => state.error);
  const startTime = useWorkspaceStore((state) => state.startTime);
  const selectedBatches = useWorkspaceStore((state) => state.selectedBatches);
  const batchComments = useWorkspaceStore((state) => state.batchComments);
  const showSourceText = useWorkspaceStore((state) => state.showSourceText);
  const editingCommentId = useWorkspaceStore((state) => state.editingCommentId);
  const isLoadingFile = useWorkspaceStore((state) => state.isLoadingFile);
  const isLoadingSubtitle = useWorkspaceStore((state) => state.isLoadingSubtitle);
  const subtitleFileName = useWorkspaceStore((state) => state.subtitleFileName);
  const speakerProfiles = useWorkspaceStore((state) => state.speakerProfiles);

  // Worker
  const { parseSubtitle, cleanup } = useFileParserWorker();

  // ============================================
  // Refs
  // ============================================
  const audioCacheRef = useRef<{ file: File; buffer: AudioBuffer } | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // ============================================
  // Hooks
  // ============================================

  const {
    toggleBatch,
    toggleAllBatches,
    selectBatchesWithComments,
    updateBatchComment,

    // Expose local setters as wrappers if needed by return signature
    setEditingCommentId: setEditingCommentIdAction,
    setShowSourceText: setShowSourceTextAction,
  } = useBatchSelection();

  const {
    updateSubtitleText,
    updateSubtitleOriginal,
    updateSpeaker,
    updateSubtitleTime,
    updateLineComment,
    deleteSubtitle,
    deleteMultipleSubtitles,
    addSubtitle,
  } = useSubtitleCRUD();

  const { addSpeaker, renameSpeaker, deleteSpeaker, mergeSpeakers, updateSpeakerColor } =
    useSpeakerProfiles();

  // Progress Handler
  const handleProgress = useCallback(
    (update: any) => {
      // Type strictness reduced for brevity in refactor, ideally ChunkStatus
      useWorkspaceStore.setState((state) => ({
        chunkProgress: { ...state.chunkProgress, [update.id]: update },
      }));
      if (update.message) useWorkspaceStore.setState({ progressMsg: update.message });
      if (update.toast) {
        addToast(update.toast.message, update.toast.type);
      }
    },
    [addToast]
  );

  // Auto-save
  useAutoSave({
    subtitles,
    batchComments,
    status,
    file,
    speakerProfiles,
    snapshotsValues,
  });

  // File operations
  const {
    handleFileChange,
    handleFileSelectNative,
    handleSubtitleImport,
    handleSubtitleImportNative,
  } = useFileOperations({
    audioCacheRef,
    showConfirm,
    snapshotsValues,
    parseSubtitle,
  });

  // Generation
  const { handleGenerate } = useGeneration({
    abortControllerRef,
    audioCacheRef,
    handleProgress,
    glossaryFlow,
    snapshotsValues,
    setShowSettings,
  });

  // Batch actions
  const { handleBatchAction, handleDownload, handleRetryGlossary } = useBatchActions({
    abortControllerRef,
    audioCacheRef,
    handleProgress,
    glossaryFlow,
    snapshotsValues,
  });

  // ============================================
  // Simple Handlers
  // ============================================
  const cancelOperation = useCallback(() => {
    if (abortControllerRef.current) {
      logger.info('User cancelled operation');
      abortControllerRef.current.abort();
      if (window.electronAPI?.abortLocalWhisper) {
        void window.electronAPI.abortLocalWhisper();
      }
    }
  }, []);

  const resetWorkspace = useCallback(() => {
    useWorkspaceStore.setState({
      subtitles: [],
      file: null,
      duration: 0,
      status: GenerationStatus.IDLE,
      batchComments: {},
      selectedBatches: new Set(),
      error: null,
    });
  }, []);

  const loadFileFromPath = useCallback(
    async (path: string) => {
      try {
        const buffer = await window.electronAPI.readLocalFile(path);
        const filename = getFilename(path) || 'video.mp4';
        const type = 'application/octet-stream';
        const fileObj = new File([buffer], filename, { type });
        Object.defineProperty(fileObj, 'path', {
          value: path,
          writable: false,
          enumerable: false,
          configurable: false,
        });

        logger.info('Loaded file from path', { path, size: fileObj.size, type: fileObj.type });

        useWorkspaceStore.setState({ file: fileObj });
        audioCacheRef.current = null;
        useWorkspaceStore.setState({ error: null });

        if (window.electronAPI && window.electronAPI.getAudioInfo) {
          try {
            const result = await window.electronAPI.getAudioInfo(path);
            if (result.success && result.info) {
              useWorkspaceStore.setState({ duration: result.info.duration });
            } else {
              useWorkspaceStore.setState({ duration: 0 });
            }
          } catch {
            useWorkspaceStore.setState({ duration: 0 });
          }
        } else {
          useWorkspaceStore.setState({ duration: 0 });
        }

        // Reset workspace
        useWorkspaceStore.setState({
          subtitles: [],
          status: GenerationStatus.IDLE,
          batchComments: {},
          selectedBatches: new Set(),
        });
      } catch (e: unknown) {
        const error = e as Error;
        logger.error('Failed to load file from path', e);
        useWorkspaceStore.setState({ error: t('unableToLoadFile', { error: error.message }) });
      }
    },
    [t]
  );

  // ============================================
  // Cleanup
  // ============================================
  useEffect(() => {
    const controller = abortControllerRef.current;
    return () => {
      cleanup();
      audioCacheRef.current = null;
      controller?.abort();
    };
  }, [cleanup]);

  // ============================================
  // Register Actions to Store (Stable Reference Pattern)
  // ============================================
  // Use a ref to always hold the latest handlers, avoiding dependency on their stability.
  // This ensures the actions object registered to the store NEVER changes reference.
  const handlersRef = useRef({
    handleFileChange,
    handleFileSelectNative,
    handleSubtitleImport,
    handleSubtitleImportNative,
    handleGenerate,
    handleDownload,
    cancelOperation,
    toggleAllBatches,
    selectBatchesWithComments,
    handleBatchAction,
    toggleBatch,
    updateBatchComment,
    updateLineComment,
    updateSubtitleText,
    updateSubtitleOriginal,
    updateSpeaker,
    updateSubtitleTime,
    deleteSubtitle,
    deleteMultipleSubtitles,
    addSubtitle,
  });

  // Keep the ref always up-to-date with latest handler implementations
  useLayoutEffect(() => {
    handlersRef.current = {
      handleFileChange,
      handleFileSelectNative,
      handleSubtitleImport,
      handleSubtitleImportNative,
      handleGenerate,
      handleDownload,
      cancelOperation,
      toggleAllBatches,
      selectBatchesWithComments,
      handleBatchAction,
      toggleBatch,
      updateBatchComment,
      updateLineComment,
      updateSubtitleText,
      updateSubtitleOriginal,
      updateSpeaker,
      updateSubtitleTime,
      deleteSubtitle,
      deleteMultipleSubtitles,
      addSubtitle,
    };
  });

  // Create STABLE action wrappers that delegate to the ref (registered ONCE)
  const stableActions = React.useMemo(
    () => ({
      handleFileChange: (...args: Parameters<typeof handleFileChange>) =>
        handlersRef.current.handleFileChange(...args),
      handleFileSelectNative: (...args: Parameters<typeof handleFileSelectNative>) =>
        handlersRef.current.handleFileSelectNative(...args),
      handleSubtitleImport: (...args: Parameters<typeof handleSubtitleImport>) =>
        handlersRef.current.handleSubtitleImport(...args),
      handleSubtitleImportNative: (...args: Parameters<typeof handleSubtitleImportNative>) =>
        handlersRef.current.handleSubtitleImportNative(...args),
      handleGenerate: (...args: Parameters<typeof handleGenerate>) =>
        handlersRef.current.handleGenerate(...args),
      handleDownload: (...args: Parameters<typeof handleDownload>) =>
        handlersRef.current.handleDownload(...args),
      cancelOperation: () => handlersRef.current.cancelOperation(),
      toggleAllBatches: (...args: Parameters<typeof toggleAllBatches>) =>
        handlersRef.current.toggleAllBatches(...args),
      selectBatchesWithComments: (...args: Parameters<typeof selectBatchesWithComments>) =>
        handlersRef.current.selectBatchesWithComments(...args),
      handleBatchAction: (...args: Parameters<typeof handleBatchAction>) =>
        handlersRef.current.handleBatchAction(...args),
      toggleBatch: (...args: Parameters<typeof toggleBatch>) =>
        handlersRef.current.toggleBatch(...args),
      updateBatchComment: (...args: Parameters<typeof updateBatchComment>) =>
        handlersRef.current.updateBatchComment(...args),
      setEditingCommentId: (id: string | null) =>
        useWorkspaceStore.setState({ editingCommentId: id }),
      setShowSourceText: (show: boolean) => useWorkspaceStore.setState({ showSourceText: show }),
      updateLineComment: (...args: Parameters<typeof updateLineComment>) =>
        handlersRef.current.updateLineComment(...args),
      updateSubtitleText: (...args: Parameters<typeof updateSubtitleText>) =>
        handlersRef.current.updateSubtitleText(...args),
      updateSubtitleOriginal: (...args: Parameters<typeof updateSubtitleOriginal>) =>
        handlersRef.current.updateSubtitleOriginal(...args),
      updateSpeaker: (...args: Parameters<typeof updateSpeaker>) =>
        handlersRef.current.updateSpeaker(...args),
      updateSubtitleTime: (...args: Parameters<typeof updateSubtitleTime>) =>
        handlersRef.current.updateSubtitleTime(...args),
      deleteSubtitle: (...args: Parameters<typeof deleteSubtitle>) =>
        handlersRef.current.deleteSubtitle(...args),
      deleteMultipleSubtitles: (...args: Parameters<typeof deleteMultipleSubtitles>) =>
        handlersRef.current.deleteMultipleSubtitles(...args),
      addSubtitle: (...args: Parameters<typeof addSubtitle>) =>
        handlersRef.current.addSubtitle(...args),
    }),
    []
  ); // Empty deps = stable forever

  // Register actions to store ONCE on mount
  useEffect(() => {
    useWorkspaceStore.getState().setActions(stableActions);
  }, [stableActions]);

  return React.useMemo(
    () => ({
      // State
      file,
      duration,
      status,
      progressMsg,
      chunkProgress,
      subtitles,
      // Pass setState generic for compatibility if needed, but components should trigger actions
      setSubtitles: (subs: any) =>
        useWorkspaceStore.setState({
          subtitles: typeof subs === 'function' ? subs(subtitles) : subs,
        }),
      error,
      startTime,
      selectedBatches,
      setSelectedBatches: (val: any) => useWorkspaceStore.setState({ selectedBatches: val }),
      batchComments,
      setBatchComments: (val: any) => useWorkspaceStore.setState({ batchComments: val }),
      showSourceText,
      setShowSourceText: setShowSourceTextAction,
      editingCommentId,
      setEditingCommentId: setEditingCommentIdAction,
      isLoadingFile,
      isLoadingSubtitle,
      subtitleFileName,
      setSubtitleFileName: (name: string) => useWorkspaceStore.setState({ subtitleFileName: name }),
      setIsLoadingFile: (loading: boolean) =>
        useWorkspaceStore.setState({ isLoadingFile: loading }),

      // Handlers
      handleFileChange,
      handleFileSelectNative,
      handleSubtitleImport,
      handleSubtitleImportNative,
      handleGenerate,
      handleBatchAction,
      handleDownload,
      handleRetryGlossary,
      toggleBatch,
      toggleAllBatches,
      selectBatchesWithComments,
      updateBatchComment,
      updateLineComment,
      updateSubtitleText,
      updateSubtitleOriginal,
      updateSpeaker,
      updateSubtitleTime,
      deleteSubtitle,
      deleteMultipleSubtitles,
      addSubtitle,
      resetWorkspace,
      cancelOperation,
      loadFileFromPath,

      // Speaker Profiles
      speakerProfiles,
      setSpeakerProfiles: (val: any) => useWorkspaceStore.setState({ speakerProfiles: val }),
      addSpeaker,
      renameSpeaker,
      deleteSpeaker,
      mergeSpeakers,
      updateSpeakerColor,
    }),
    [
      file,
      duration,
      status,
      progressMsg,
      chunkProgress,
      subtitles,
      error,
      startTime,
      selectedBatches,
      batchComments,
      showSourceText,
      editingCommentId,
      isLoadingFile,
      isLoadingSubtitle,
      subtitleFileName,
      speakerProfiles,
      // Actions
      handleFileChange,
      handleFileSelectNative,
      handleSubtitleImport,
      handleSubtitleImportNative,
      handleGenerate,
      handleBatchAction,
      handleDownload,
      handleRetryGlossary,
      toggleBatch,
      toggleAllBatches,
      selectBatchesWithComments,
      updateBatchComment,
      updateLineComment,
      updateSubtitleText,
      updateSubtitleOriginal,
      updateSpeaker,
      updateSubtitleTime,
      deleteSubtitle,
      deleteMultipleSubtitles,
      addSubtitle,
      resetWorkspace,
      cancelOperation,
      loadFileFromPath,
      addSpeaker,
      renameSpeaker,
      deleteSpeaker,
      mergeSpeakers,
      updateSpeakerColor,
      setEditingCommentIdAction,
      setShowSourceTextAction,
    ]
  );
};
