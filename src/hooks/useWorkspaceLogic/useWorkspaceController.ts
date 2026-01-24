import type React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@/store/useAppStore';
import {
  useWorkspaceStore,
  selectFileState,
  selectSubtitleState,
  selectGenerationState,
  selectUIState,
} from '@/store/useWorkspaceStore';
import { isVideoFile } from '@/services/utils/file';
import { GenerationStatus } from '@/types/api';

/**
 * Valid active tab types for the workspace
 */
export type WorkspaceTab = 'new' | 'import';

/**
 * Controller hook for Workspace logic
 * Centralizes state access and action binding from useAppStore and useWorkspaceStore
 */
export const useWorkspaceController = (activeTab: WorkspaceTab) => {
  // ============================================================================
  // App Store State
  // ============================================================================
  const settings = useAppStore(
    useShallow((s) => ({
      genre: s.settings.genre,
      activeGlossaryId: s.settings.activeGlossaryId,
      glossaries: s.settings.glossaries,
      targetLanguage: s.settings.targetLanguage,
      outputMode: s.settings.outputMode,
      enableDiarization: s.settings.enableDiarization,
      minSpeakers: s.settings.minSpeakers,
      maxSpeakers: s.settings.maxSpeakers,
      zoomLevel: s.settings.zoomLevel,
      showSnapshots: s.showSnapshots,
    }))
  );

  const updateSetting = useAppStore((s) => s.updateSetting);
  const setShowGenreSettings = useAppStore((s) => s.setShowGenreSettings);
  const setShowSnapshots = useAppStore((s) => s.setShowSnapshots);

  // ============================================================================
  // Workspace Store State
  // ============================================================================
  const fileState = useWorkspaceStore(useShallow(selectFileState));
  const subtitleState = useWorkspaceStore(useShallow(selectSubtitleState));
  const generationState = useWorkspaceStore(useShallow(selectGenerationState));
  const uiState = useWorkspaceStore(useShallow(selectUIState)); // Added if needed, though Sidebar uses granular

  // ============================================================================
  // Actions & Handlers
  // ============================================================================
  const actions = useWorkspaceStore((s) => s.actions);

  const handlers = {
    handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      actions.handleFileChange(e, activeTab),
    handleFileSelectNative: actions.handleFileSelectNative,
    handleSubtitleImport: actions.handleSubtitleImport,
    handleSubtitleImportNative: actions.handleSubtitleImportNative,
    handleGenerate: actions.handleGenerate,
    handleDownload: actions.handleDownload,
    setShowSourceText: actions.setShowSourceText,
    cancelOperation: actions.cancelOperation,
  };

  // ============================================================================
  // Computed Properties
  // ============================================================================
  const isElectron = typeof window !== 'undefined' && !!window.electronAPI?.isElectron;

  const isProcessing =
    generationState.status === GenerationStatus.UPLOADING ||
    generationState.status === GenerationStatus.PROCESSING ||
    generationState.status === GenerationStatus.PROOFREADING;

  const hasFile = !!fileState.file;
  const hasSubtitles = subtitleState.subtitles.length > 0;
  const isVideo = hasFile && isVideoFile(fileState.file);

  const canShowCompression = (onStartCompression?: () => void) =>
    isElectron &&
    !!onStartCompression &&
    ((activeTab === 'new' && isVideo && hasSubtitles) ||
      (activeTab === 'import' && isVideo && hasSubtitles));

  return {
    // State
    settings,
    fileState,
    subtitleState,
    generationState,
    uiState,

    // Setters / Actions
    updateSetting,
    setShowGenreSettings,
    setShowSnapshots,
    handlers,

    // Computed
    isElectron,
    isProcessing,
    canShowCompression,
  };
};
