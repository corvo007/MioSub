/**
 * Pipeline Core - Shared initialization logic for subtitle generation
 *
 * Provides common initialization for both full generation and regeneration:
 * - AI client creation
 * - PipelineContext construction
 * - Semaphore configuration with proper concurrency limits
 * - Usage tracking
 */

import { GoogleGenAI } from '@google/genai';
import { type PipelineContext, type PipelineVideoInfo } from '@/types/pipeline';
import { type AppSettings } from '@/types/settings';
import { type ChunkStatus } from '@/types/api';
import { UsageReporter } from './usageReporter';
import { Semaphore } from '@/services/utils/concurrency';
import { ENV } from '@/config';
import i18n from '@/i18n';

// ============================================================================
// Types
// ============================================================================

export interface PipelineInitOptions {
  settings: AppSettings;
  onProgress?: (update: ChunkStatus) => void;
  signal?: AbortSignal;
  videoInfo?: PipelineVideoInfo;
  /** Override isDebug detection (for testing) */
  isDebugOverride?: boolean;
  /** Skip OpenAI key validation (for proofread-only operations) */
  skipOpenAI?: boolean;
}

export interface PipelineInitResult {
  context: PipelineContext;
  usageReporter: UsageReporter;
  trackUsage: (usage: any) => void;
  semaphores: {
    transcription: Semaphore;
    refinement: Semaphore;
    alignment: Semaphore;
  };
  /** Computed concurrency values for reference */
  concurrency: {
    pipeline: number;
    transcription: number;
    local: number;
  };
}

// ============================================================================
// Core Initialization
// ============================================================================

/**
 * Initialize pipeline context and shared resources.
 *
 * This centralizes the initialization logic used by both:
 * - Full generation (pipeline/index.ts)
 * - Partial regeneration (batch/regenerate.ts)
 *
 * @throws Error if required API keys are missing
 */
export function initializePipelineContext(options: PipelineInitOptions): PipelineInitResult {
  const { settings, onProgress, signal, videoInfo, isDebugOverride } = options;

  // ===== API Key Validation =====
  const geminiKey = ENV.GEMINI_API_KEY || settings.geminiKey?.trim();
  const openaiKey = ENV.OPENAI_API_KEY || settings.openaiKey?.trim();

  if (!geminiKey) {
    throw new Error(i18n.t('services:pipeline.errors.missingGeminiKey'));
  }

  // OpenAI key is optional if using local whisper or if explicitly skipped
  if (!openaiKey && !settings.useLocalWhisper && !options.skipOpenAI) {
    throw new Error(i18n.t('services:pipeline.errors.missingOpenAIKey'));
  }

  // ===== AI Client Creation =====
  const ai = new GoogleGenAI({
    apiKey: geminiKey,
    httpOptions: {
      ...(settings.geminiEndpoint ? { baseUrl: settings.geminiEndpoint } : {}),
      timeout: (settings.requestTimeout || 600) * 1000,
    },
  });

  // ===== Usage Tracking =====
  const usageReporter = new UsageReporter();
  const trackUsage = usageReporter.getTracker();

  // ===== Debug Mode Detection =====
  const isDebug = isDebugOverride ?? window.electronAPI?.isDebug ?? false;

  // ===== Pipeline Context =====
  const context: PipelineContext = {
    ai,
    settings,
    signal,
    trackUsage,
    usageReporter,
    onProgress,
    isDebug,
    geminiKey,
    openaiKey,
    videoInfo,
  };

  // ===== Concurrency Configuration =====
  // We separate concurrency limits for different resource types:
  // 1. Pipeline (Flash API) - General Gemini Flash operations
  // 2. Transcription - OpenAI/Local Whisper (CPU-intensive if local)
  // 3. Alignment - CTC alignment (CPU-intensive, uses PyTorch)

  const pipelineConcurrency = settings.concurrencyFlash || 5;
  const localConcurrency = settings.localConcurrency || 1;

  // Transcription limit depends on whether using local or cloud
  const transcriptionLimit = settings.useLocalWhisper
    ? localConcurrency // Local Whisper is CPU-intensive
    : pipelineConcurrency; // Cloud can handle higher concurrency

  const semaphores = {
    transcription: new Semaphore(transcriptionLimit),
    refinement: new Semaphore(pipelineConcurrency),
    alignment: new Semaphore(localConcurrency), // CTC is memory-intensive
  };

  return {
    context,
    usageReporter,
    trackUsage,
    semaphores,
    concurrency: {
      pipeline: pipelineConcurrency,
      transcription: transcriptionLimit,
      local: localConcurrency,
    },
  };
}

/**
 * Calculate the optimal concurrency for the main processing loop.
 *
 * This balances:
 * - Enough parallelism for pipeline throughput
 * - Not too many promises to avoid memory issues
 *
 * @param totalChunks Total number of chunks to process
 * @param pipelineConcurrency Base pipeline concurrency setting
 * @returns Optimal main loop concurrency (capped at 50)
 */
export function calculateMainLoopConcurrency(
  totalChunks: number,
  pipelineConcurrency: number
): number {
  // Use a reasonable upper bound: max 50 to prevent excessive Promise creation
  // Minimum is the larger of totalChunks, pipelineConcurrency, or 20
  return Math.min(Math.max(totalChunks, pipelineConcurrency, 20), 50);
}
