/**
 * Artifact Metadata Types
 *
 * Used for debug artifact files (JSON and SRT) to provide context
 * about the video, chunk, and pipeline settings.
 */

/**
 * Video information for artifact metadata
 */
export interface VideoInfo {
  /** Original filename (e.g., "example.mp4") */
  filename: string;
  /** Video duration in seconds */
  duration: number;
  /** Optional full path */
  path?: string;
}

/**
 * Chunk information for artifact metadata
 */
export interface ChunkInfo {
  /** Chunk index (1-indexed) */
  index: number;
  /** Start time in seconds (relative to video) */
  start: number;
  /** End time in seconds (relative to video) */
  end: number;
  /** Chunk duration in seconds */
  duration: number;
}

/**
 * Pipeline stage information for artifact metadata
 */
export interface PipelineInfo {
  /** Current pipeline stage */
  stage: 'whisper' | 'refinement' | 'alignment' | 'translation';
  /** Timestamp format in the artifact */
  timeFormat: 'relative' | 'global';
  /** Number of segments in this artifact */
  segmentCount: number;
  /** Optional subset of settings relevant for debugging */
  settings?: {
    alignmentMode?: string;
    enableDiarization?: boolean;
    transcriptionModel?: string;
  };
}

/**
 * Complete artifact metadata structure
 */
export interface ArtifactMetadata {
  /** Schema version for future compatibility */
  version: string;
  /** ISO timestamp when artifact was created */
  timestamp: string;
  /** Video information (optional for chunk-level artifacts) */
  video?: VideoInfo;
  /** Chunk information (only for chunk-level artifacts) */
  chunk?: ChunkInfo;
  /** Pipeline stage information */
  pipeline: PipelineInfo;
}

/**
 * JSON artifact wrapper structure
 */
export interface JsonArtifact<T> {
  _metadata: ArtifactMetadata;
  segments: T;
}
