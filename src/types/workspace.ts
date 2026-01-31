import { type RefObject } from 'react';
import { type SubtitleItem, type SubtitleSnapshot } from '@/types/subtitle';
import { type SpeakerUIProfile } from '@/types/speaker';
import {
  type GlossaryItem,
  type GlossaryExtractionResult,
  type GlossaryExtractionMetadata,
} from '@/types/glossary';
import { type ChunkStatus } from '@/types/api';

/**
 * Shared refs used across workspace hooks
 */
export interface WorkspaceRefs {
  audioCacheRef: RefObject<{ file: File; buffer: AudioBuffer } | null>;
  abortControllerRef: RefObject<AbortController | null>;
  subtitlesRef: RefObject<SubtitleItem[]>;
}

/**
 * Glossary flow props for confirmation dialogs
 */
export interface GlossaryFlowProps {
  glossaryMetadata: GlossaryExtractionMetadata | null;
  setGlossaryMetadata: (data: GlossaryExtractionMetadata | null) => void;
  setPendingGlossaryResults: (results: GlossaryExtractionResult[]) => void;
  setShowGlossaryConfirmation: (show: boolean) => void;
  setShowGlossaryFailure: (show: boolean) => void;
  glossaryConfirmCallback: ((items: GlossaryItem[]) => void) | null;
  setGlossaryConfirmCallback: (cb: ((items: GlossaryItem[]) => void) | null) => void;
  setIsGeneratingGlossary: (isGenerating: boolean) => void;
}

/**
 * Snapshot management props
 */
export interface SnapshotsValuesProps {
  setSnapshots: (snapshots: SubtitleSnapshot[]) => void;
  createSnapshot: (
    description: string,
    subtitles: SubtitleItem[],
    batchComments?: Record<string, string>,
    fileId?: string,
    fileName?: string,
    speakerProfiles?: SpeakerUIProfile[]
  ) => void;
  createAutoSaveSnapshot: (
    subtitles: SubtitleItem[],
    batchComments: Record<string, string>,
    fileId?: string,
    fileName?: string,
    speakerProfiles?: SpeakerUIProfile[]
  ) => boolean;
  deleteSnapshot: (id: string) => void;
}

/**
 * Progress handler function type
 */
export type ProgressHandler = (update: ChunkStatus) => void;
