/**
 * Workspace Store - Zustand store for workspace state management
 *
 * This store centralizes workspace state that was previously managed in useWorkspaceLogic
 * and passed as 50+ props through WorkspacePage.
 *
 * Migration Strategy:
 * - Core state lives in this store
 * - useWorkspaceLogic reads/writes to this store
 * - WorkspacePage consumes from this store directly
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import {
  type SubtitleItem,
  type BatchOperationMode,
  type RegeneratePrompts,
} from '@/types/subtitle';
import { type SpeakerUIProfile } from '@/types/speaker';
import { GenerationStatus, type ChunkStatus } from '@/types/api';
import type React from 'react';

// ============================================
// State Types
// ============================================

interface WorkspaceState {
  // Core file state
  file: File | null;
  duration: number;

  // Subtitle state
  subtitles: SubtitleItem[];
  subtitleFileName: string | null;

  // Generation state
  status: GenerationStatus;
  error: string | null;
  progressMsg: string;
  chunkProgress: Record<string, ChunkStatus>;
  startTime: number | null;

  // UI state
  selectedBatches: Set<number>;
  batchComments: Record<number, string>;
  showSourceText: boolean;
  editingCommentId: string | null;
  isLoadingFile: boolean;
  isLoadingSubtitle: boolean;

  // Speaker state
  // Speaker state
  speakerProfiles: SpeakerUIProfile[];

  // Logic Actions (Bridge)
  actions: WorkspacePageActions;
}

interface WorkspaceActions {
  // Core setters
  setFile: (file: File | null) => void;
  setDuration: (duration: number) => void;
  setSubtitles: (subtitles: SubtitleItem[]) => void;
  setSubtitleFileName: (name: string | null) => void;

  // Generation setters
  setStatus: (status: GenerationStatus) => void;
  setError: (error: string | null) => void;
  setProgressMsg: (msg: string) => void;
  setChunkProgress: (progress: Record<string, ChunkStatus>) => void;
  updateChunkProgress: (update: ChunkStatus) => void;
  setStartTime: (time: number | null) => void;

  // UI setters
  setSelectedBatches: (batches: Set<number>) => void;
  setBatchComments: (comments: Record<number, string>) => void;
  setShowSourceText: (show: boolean) => void;
  setEditingCommentId: (id: string | null) => void;
  setIsLoadingFile: (loading: boolean) => void;
  setIsLoadingSubtitle: (loading: boolean) => void;

  // Speaker setters
  setSpeakerProfiles: (profiles: SpeakerUIProfile[]) => void;

  // Compound actions
  // Compound actions
  resetWorkspace: () => void;
  // actions and setActions are part of State/Actions respectively
  setActions: (actions: Partial<WorkspacePageActions>) => void;
}

export interface WorkspacePageActions {
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>, activeTab: 'new' | 'import') => void;
  handleFileSelectNative: (fileStub: any) => void;
  handleSubtitleImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleSubtitleImportNative: () => void;

  // Generation
  handleGenerate: () => void;
  handleDownload: (format: 'srt' | 'ass') => void;
  cancelOperation: () => void;

  // Batches & Lines
  toggleAllBatches: (totalBatches: number) => void;
  selectBatchesWithComments: (chunks: SubtitleItem[][]) => void;
  handleBatchAction: (
    mode: BatchOperationMode,
    singleIndex?: number,
    prompts?: RegeneratePrompts
  ) => void;
  toggleBatch: (id: number) => void;
  updateBatchComment: (id: number, comment: string) => void;
  setEditingCommentId: (id: string | null) => void;
  setShowSourceText: (show: boolean) => void;
  // setIsLoadingFile intentionally removed to prevent UI from setting it directly
  // Loading state should be managed by logic hooks only

  updateLineComment: (id: string, comment: string) => void;

  // Subtitle CRUD
  updateSubtitleText: (id: string, text: string) => void;
  updateSubtitleOriginal: (id: string, text: string) => void;
  updateSpeaker: (id: string, speaker: string | undefined) => void;
  updateSubtitleTime: (id: string, startTime: string, endTime: string) => void;
  deleteSubtitle: (id: string) => void;
  deleteMultipleSubtitles: (ids: string[]) => void;
  addSubtitle: (referenceId: string, position: 'before' | 'after', defaultTime: string) => void;
}

// ============================================
// Initial State
// ============================================

const initialState: WorkspaceState = {
  file: null,
  duration: 0,
  subtitles: [],
  subtitleFileName: null,
  status: GenerationStatus.IDLE,
  error: null,
  progressMsg: '',
  chunkProgress: {},
  startTime: null,
  selectedBatches: new Set(),
  batchComments: {},
  showSourceText: true,
  editingCommentId: null,
  isLoadingFile: false,
  isLoadingSubtitle: false,
  speakerProfiles: [],
  actions: {
    handleFileChange: () => {},
    handleFileSelectNative: () => {},
    handleSubtitleImport: () => {},
    handleSubtitleImportNative: () => {},
    handleGenerate: () => {},
    handleDownload: () => {},
    cancelOperation: () => {},
    toggleAllBatches: () => {},
    selectBatchesWithComments: () => {},
    handleBatchAction: () => {},
    toggleBatch: () => {},
    updateBatchComment: () => {},
    setEditingCommentId: () => {},
    setShowSourceText: () => {},

    updateLineComment: () => {},
    updateSubtitleText: () => {},
    updateSubtitleOriginal: () => {},
    updateSpeaker: () => {},
    updateSubtitleTime: () => {},
    deleteSubtitle: () => {},
    deleteMultipleSubtitles: () => {},
    addSubtitle: () => {},
  },
};

// ============================================
// Store
// ============================================

export const useWorkspaceStore = create<WorkspaceState & WorkspaceActions>()(
  subscribeWithSelector((set, _get) => ({
    ...initialState,

    // Core setters
    setFile: (file) => set({ file }),
    setDuration: (duration) => set({ duration }),
    setSubtitles: (subtitles) => set({ subtitles }),
    setSubtitleFileName: (subtitleFileName) => set({ subtitleFileName }),

    // Generation setters
    setStatus: (status) => set({ status }),
    setError: (error) => set({ error }),
    setProgressMsg: (progressMsg) => set({ progressMsg }),
    setChunkProgress: (chunkProgress) => set({ chunkProgress }),
    updateChunkProgress: (update) =>
      set((state) => ({
        chunkProgress: { ...state.chunkProgress, [update.id]: update },
        progressMsg: update.message || state.progressMsg,
      })),
    setStartTime: (startTime) => set({ startTime }),

    // UI setters
    setSelectedBatches: (selectedBatches) => set({ selectedBatches }),
    setBatchComments: (batchComments) => set({ batchComments }),
    setShowSourceText: (showSourceText) => set({ showSourceText }),
    setEditingCommentId: (editingCommentId) => set({ editingCommentId }),
    setIsLoadingFile: (isLoadingFile) => set({ isLoadingFile }),
    setIsLoadingSubtitle: (isLoadingSubtitle) => set({ isLoadingSubtitle }),

    // Speaker setters
    setSpeakerProfiles: (speakerProfiles) => set({ speakerProfiles }),

    // Compound actions
    resetWorkspace: () =>
      set({
        file: null,
        duration: 0,
        subtitles: [],
        subtitleFileName: null,
        status: GenerationStatus.IDLE,
        error: null,
        progressMsg: '',
        chunkProgress: {},
        startTime: null,
        selectedBatches: new Set(),
        batchComments: {},
        editingCommentId: null,
        isLoadingFile: false,
        isLoadingSubtitle: false,
        speakerProfiles: [],
        // Note: showSourceText is intentionally preserved across workspace resets
      }),

    // Bridge Action Setter
    setActions: (actions) => set((state) => ({ actions: { ...state.actions, ...actions } })),
  }))
);

// ============================================
// Selector helpers for performance
// ============================================

/** Select only core file state */
export const selectFileState = (state: WorkspaceState & WorkspaceActions) => ({
  file: state.file,
  duration: state.duration,
  isLoadingFile: state.isLoadingFile,
});

/** Select only subtitle state */
export const selectSubtitleState = (state: WorkspaceState & WorkspaceActions) => ({
  subtitles: state.subtitles,
  subtitleFileName: state.subtitleFileName,
  isLoadingSubtitle: state.isLoadingSubtitle,
});

/** Select only generation state */
export const selectGenerationState = (state: WorkspaceState & WorkspaceActions) => ({
  status: state.status,
  error: state.error,
  chunkProgress: state.chunkProgress,
  startTime: state.startTime,
});

/** Select only UI state */
export const selectUIState = (state: WorkspaceState & WorkspaceActions) => ({
  selectedBatches: state.selectedBatches,
  batchComments: state.batchComments,
  showSourceText: state.showSourceText,
  editingCommentId: state.editingCommentId,
});
