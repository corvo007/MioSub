import React, { useState, useRef, useEffect, useCallback } from 'react';
import { type SubtitleItem, type SubtitleSnapshot } from '@/types/subtitle';
import { type AppSettings } from '@/types/settings';
import {
  type GlossaryItem,
  type GlossaryExtractionResult,
  type GlossaryExtractionMetadata,
} from '@/types/glossary';
import { GenerationStatus, type ChunkStatus } from '@/types/api';
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
  settings: AppSettings;
  updateSetting: (key: keyof AppSettings, value: unknown) => void;
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
      fileName?: string
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

export const useWorkspaceLogic = ({
  settings,
  updateSetting,
  addToast,
  showConfirm,
  glossaryFlow,
  snapshotsValues,
  setShowSettings,
}: UseWorkspaceLogicProps) => {
  // ============================================
  // Core State
  // ============================================
  const { parseSubtitle, cleanup } = useFileParserWorker();
  const [file, setFile] = useState<File | null>(null);
  const [duration, setDuration] = useState<number>(0);
  const [status, setStatus] = useState<GenerationStatus>(GenerationStatus.IDLE);
  const [progressMsg, setProgressMsg] = useState('');
  const [chunkProgress, setChunkProgress] = useState<Record<string, ChunkStatus>>({});
  const [subtitles, setSubtitles] = useState<SubtitleItem[]>([]);
  const subtitlesRef = useRef(subtitles);
  useEffect(() => {
    subtitlesRef.current = subtitles;
  }, [subtitles]);
  const [error, setError] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<number | null>(null);

  // ============================================
  // Refs
  // ============================================
  const audioCacheRef = useRef<{ file: File; buffer: AudioBuffer } | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // ============================================
  // Existing Extracted Hooks
  // ============================================
  const {
    selectedBatches,
    setSelectedBatches,
    batchComments,
    setBatchComments,
    showSourceText,
    setShowSourceText,
    editingCommentId,
    setEditingCommentId,
    toggleBatch,
    toggleAllBatches,
    selectBatchesWithComments,
    updateBatchComment,
    resetBatchState: _resetBatchState,
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
  } = useSubtitleCRUD({ setSubtitles });

  const {
    speakerProfiles,
    setSpeakerProfiles,
    addSpeaker,
    renameSpeaker,
    deleteSpeaker,
    mergeSpeakers,
  } = useSpeakerProfiles({ subtitles, setSubtitles });

  // ============================================
  // Progress Handler (shared by generation and batch actions)
  // ============================================
  const handleProgress = useCallback(
    (update: ChunkStatus) => {
      setChunkProgress((prev) => ({ ...prev, [update.id]: update }));
      if (update.message) setProgressMsg(update.message);
      if (update.toast) {
        addToast(update.toast.message, update.toast.type);
      }
    },
    [addToast]
  );

  // ============================================
  // New Extracted Hooks
  // ============================================

  // Auto-save (pure side effect)
  useAutoSave({
    subtitles,
    batchComments,
    status,
    file,
    snapshotsValues,
  });

  // File operations
  const {
    handleFileChange,
    handleFileSelectNative,
    handleSubtitleImport,
    handleSubtitleImportNative,
    isLoadingFile,
    setIsLoadingFile,
    isLoadingSubtitle,
    subtitleFileName,
    setSubtitleFileName,
  } = useFileOperations({
    file,
    subtitles,
    status,
    setFile,
    setSubtitles,
    setStatus,
    setError,
    setDuration,
    setSpeakerProfiles,
    setBatchComments,
    setSelectedBatches,
    audioCacheRef,
    showConfirm,
    snapshotsValues,
    parseSubtitle,
  });

  // Generation
  const { handleGenerate } = useGeneration({
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
  });

  // Batch actions
  const { handleBatchAction, handleDownload, handleRetryGlossary } = useBatchActions({
    file,
    subtitles,
    selectedBatches,
    batchComments,
    settings,
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
  });

  // ============================================
  // Simple Handlers (kept in coordinator)
  // ============================================
  const cancelOperation = useCallback(() => {
    if (abortControllerRef.current) {
      logger.info('User cancelled operation');
      abortControllerRef.current.abort();

      // Call local whisper abort if applicable
      if (window.electronAPI?.abortLocalWhisper) {
        void window.electronAPI.abortLocalWhisper();
      }
    }
  }, []);

  const resetWorkspace = useCallback(() => {
    setSubtitles([]);
    setFile(null);
    setDuration(0);
    setStatus(GenerationStatus.IDLE);
    snapshotsValues.setSnapshots([]);
    setBatchComments({});
    setSelectedBatches(new Set());
    setError(null);
  }, [snapshotsValues, setBatchComments, setSelectedBatches]);

  const loadFileFromPath = useCallback(
    async (path: string) => {
      try {
        // Use IPC to read file buffer (bypassing CSP/Sandbox)
        const buffer = await window.electronAPI.readLocalFile(path);

        // Create a File object
        const filename = getFilename(path) || 'video.mp4';
        // Determine mime type based on extension
        const ext = filename.split('.').pop()?.toLowerCase();
        const type =
          ext === 'mp4' ? 'video/mp4' : ext === 'mkv' ? 'video/x-matroska' : 'video/webm';

        const fileObj = new File([buffer], filename, { type });
        // Manually attach path for Electron/FFmpeg usage
        Object.defineProperty(fileObj, 'path', {
          value: path,
          writable: false,
          enumerable: false, // standard File.path is not enumerable
          configurable: false,
        });

        logger.info('Loaded file from path', { path, size: fileObj.size, type: fileObj.type });

        setFile(fileObj);
        audioCacheRef.current = null;
        setError(null);

        // Get duration using Electron API
        if (window.electronAPI && window.electronAPI.getAudioInfo) {
          try {
            const result = await window.electronAPI.getAudioInfo(path);
            if (result.success && result.info) {
              setDuration(result.info.duration);
            } else {
              setDuration(0);
            }
          } catch (_e) {
            setDuration(0);
          }
        } else {
          setDuration(0);
        }

        // Reset workspace state
        setSubtitles([]);
        setStatus(GenerationStatus.IDLE);
        snapshotsValues.setSnapshots([]);
        setBatchComments({});
        setSelectedBatches(new Set());
      } catch (e: unknown) {
        const error = e as Error;
        logger.error('Failed to load file from path', e);
        setError('无法加载文件: ' + error.message);
      }
    },
    [snapshotsValues, setBatchComments, setSelectedBatches]
  );

  // ============================================
  // Cleanup
  // ============================================
  useEffect(() => {
    return () => {
      cleanup();
      audioCacheRef.current = null;
      abortControllerRef.current?.abort();
    };
  }, [cleanup]);

  // ============================================
  // Return Memoized Object
  // ============================================
  return React.useMemo(
    () => ({
      // State
      file,
      duration,
      status,
      progressMsg,
      chunkProgress,
      subtitles,
      setSubtitles,
      error,
      startTime,
      selectedBatches,
      setSelectedBatches,
      batchComments,
      setBatchComments,
      showSourceText,
      setShowSourceText,
      editingCommentId,
      setEditingCommentId,
      isLoadingFile,
      isLoadingSubtitle,
      subtitleFileName,
      setSubtitleFileName,
      setIsLoadingFile,

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
      setSpeakerProfiles,
      addSpeaker,
      renameSpeaker,
      deleteSpeaker,
      mergeSpeakers,
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
      speakerProfiles,
      addSpeaker,
      renameSpeaker,
      deleteSpeaker,
      mergeSpeakers,
      setSelectedBatches,
      setBatchComments,
      setIsLoadingFile,
      setSubtitleFileName,
      setSpeakerProfiles,
      setEditingCommentId,
      setShowSourceText,
    ]
  );
};
