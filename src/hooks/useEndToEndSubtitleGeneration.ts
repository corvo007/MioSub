/**
 * End-to-End Subtitle Generation Handler
 * 用于处理主进程发送的字幕生成请求
 */

import { useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { generateSubtitles } from '@/services/generation/pipeline';
import { type ChunkAnalytics } from '@/types/api';
import { generateAssContent, generateSrtContent } from '@/services/subtitle/generator';
import { decodeAudioWithRetry } from '@/services/audio/decoder';
import { autoConfirmGlossaryTerms } from '@/services/glossary/autoConfirm';
import { getActiveGlossaryTerms } from '@/services/glossary/utils';
import { logger } from '@/services/utils/logger';
import { UserActionableError } from '@/services/utils/errors';
import type { AppSettings } from '@/types/settings';
import type { SubtitleItem } from '@/types/subtitle';
import type { ChunkStatus } from '@/types/api';
import * as Sentry from '@sentry/electron/renderer';
import { ExpectedError } from '@/utils/expectedError';

interface UseEndToEndSubtitleGenerationProps {
  settings: AppSettings;
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
}

/**
 * Hook that listens for end-to-end subtitle generation requests from main process
 * and executes the generation pipeline
 */
export function useEndToEndSubtitleGeneration({
  settings,
  updateSetting,
}: UseEndToEndSubtitleGenerationProps) {
  const { t } = useTranslation('endToEnd');
  const isProcessingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Use refs to store settings and updateSetting to prevent infinite loop
  // These refs always have the latest values without triggering re-renders
  const settingsRef = useRef(settings);
  const updateSettingRef = useRef(updateSetting);

  // Keep refs in sync with props
  settingsRef.current = settings;
  updateSettingRef.current = updateSetting;

  /**
   * Load audio file from path and decode it
   */
  const loadAudioFromPath = useCallback(async (audioPath: string): Promise<File> => {
    if (!window.electronAPI?.readLocalFile) {
      throw new Error('Electron API not available');
    }

    // Read file buffer via IPC
    const buffer = await window.electronAPI.readLocalFile(audioPath);

    // Create a File object from the buffer
    const filename = audioPath.split(/[\\/]/).pop() || 'audio.wav';
    const file = new File([buffer], filename, { type: 'audio/wav' });

    // Attach path for reference
    Object.defineProperty(file, 'path', {
      value: audioPath,
      writable: false,
      enumerable: false,
      configurable: false,
    });

    return file;
  }, []);

  /**
   * Execute subtitle generation with enhanced edge case handling
   */
  const executeGeneration = useCallback(
    async (
      config: any,
      audioPath: string
    ): Promise<{
      success: boolean;
      subtitles?: SubtitleItem[];
      subtitlePath?: string;
      subtitleContent?: string;
      subtitleFormat?: string;
      error?: string;
      errorCode?: string;
      chunkAnalytics?: ChunkAnalytics[];
    }> => {
      // Guard: Already processing
      if (isProcessingRef.current) {
        logger.warn('[EndToEnd] Already processing, rejecting new request');
        return { success: false, error: t('errors.busy'), errorCode: 'BUSY' };
      }

      // Guard: Missing audio path
      if (!audioPath || typeof audioPath !== 'string') {
        logger.error('[EndToEnd] Invalid audio path', { audioPath });
        return { success: false, error: t('errors.invalidPath'), errorCode: 'INVALID_PATH' };
      }

      isProcessingRef.current = true;
      const startTime = Date.now();
      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;

      // Timeout protection (24 hours max)
      const timeoutMs = 24 * 60 * 60 * 1000;
      const timeoutId = setTimeout(() => {
        logger.warn('[EndToEnd] Generation timeout, aborting');
        abortControllerRef.current?.abort();
      }, timeoutMs);

      // Capture incremental chunk analytics for reporting
      let accumulatedChunkAnalytics: ChunkAnalytics[] = [];

      try {
        logger.info('[EndToEnd] Starting subtitle generation', { audioPath, config });

        // Validate API keys before starting (use ref to access latest settings)
        const currentSettings = settingsRef.current;
        const hasGeminiKey = currentSettings.geminiKey?.trim() || process.env.VITE_GEMINI_API_KEY;
        const hasOpenAIKey = currentSettings.openaiKey?.trim() || process.env.VITE_OPENAI_API_KEY;

        if (!hasGeminiKey) {
          return {
            success: false,
            error: t('errors.missingGeminiKey'),
            errorCode: 'MISSING_API_KEY',
          };
        }
        if (!hasOpenAIKey && !currentSettings.useLocalWhisper) {
          return {
            success: false,
            error: t('errors.missingOpenAIKey'),
            errorCode: 'MISSING_API_KEY',
          };
        }

        // Load audio file with error handling
        let audioFile: File;
        try {
          audioFile = await loadAudioFromPath(audioPath);
          logger.info('[EndToEnd] Audio file loaded', { size: audioFile.size });
        } catch (loadError: any) {
          logger.error('[EndToEnd] Failed to load audio file', loadError);
          return {
            success: false,
            error: t('errors.fileReadError', { error: loadError.message }),
            errorCode: 'FILE_READ_ERROR',
          };
        }

        // Guard: Empty audio file
        if (audioFile.size === 0) {
          logger.error('[EndToEnd] Audio file is empty');
          return { success: false, error: t('errors.fileEmpty'), errorCode: 'EMPTY_FILE' };
        }

        // Guard: File too small (likely corrupted, less than 1KB)
        if (audioFile.size < 1024) {
          logger.warn('[EndToEnd] Audio file suspiciously small', { size: audioFile.size });
          return { success: false, error: t('errors.fileCorrupt'), errorCode: 'CORRUPT_FILE' };
        }

        // Decode audio with error handling
        let audioBuffer: AudioBuffer;
        const audioFileName = audioFile.name; // Capture name before clearing file
        try {
          audioBuffer = await decodeAudioWithRetry(audioFile);
          logger.info('[EndToEnd] Audio decoded', { duration: audioBuffer.duration });

          // Release reference to the original file buffer to allow GC to reclaim memory
          // The audioFile (~500MB+ for large files) is no longer needed after decoding
          (audioFile as any) = null;
        } catch (decodeError: any) {
          logger.error('[EndToEnd] Failed to decode audio', decodeError);
          return {
            success: false,
            error: t('errors.decodeError', { error: decodeError.message }),
            errorCode: 'DECODE_ERROR',
          };
        }

        // Analytics: End-to-End Generation Started
        // We do this after decoding to get accurate duration
        if (window.electronAPI?.analytics) {
          void window.electronAPI.analytics.track(
            'end_to_end_generation_started',
            {
              // File info
              file_ext: audioPath.split('.').pop() || 'unknown',
              video_duration: audioBuffer.duration,

              // Core settings
              genre: currentSettings.genre,
              target_language: currentSettings.targetLanguage,
              output_mode: config.outputMode || 'bilingual',

              // Transcription
              model: currentSettings.useLocalWhisper ? 'local' : 'api',

              // Concurrency & Performance
              concurrency_flash: currentSettings.concurrencyFlash,
              concurrency_pro: currentSettings.concurrencyPro,
              concurrency_local: currentSettings.localConcurrency,
              chunk_duration: currentSettings.chunkDuration,
              use_smart_split: currentSettings.useSmartSplit,

              // Batch sizes
              translation_batch_size: currentSettings.translationBatchSize,
              proofread_batch_size: currentSettings.proofreadBatchSize,

              // Alignment
              alignment_mode: currentSettings.alignmentMode,

              // Glossary settings
              enable_auto_glossary: config.enableGlossary ?? currentSettings.enableAutoGlossary,
              glossary_auto_confirm: true, // End-to-end always auto-confirms
              glossary_sample_minutes: currentSettings.glossarySampleMinutes,
              has_preset_glossary: !!(
                currentSettings.activeGlossaryId && currentSettings.glossaries?.length
              ),
              preset_glossary_terms_count:
                currentSettings.glossaries?.find((g) => g.id === currentSettings.activeGlossaryId)
                  ?.terms?.length || 0,

              // Diarization settings
              enable_diarization: config.enableDiarization ?? currentSettings.enableDiarization,
              enable_speaker_pre_analysis:
                config.enableSpeakerPreAnalysis ?? currentSettings.enableSpeakerPreAnalysis,
              min_speakers: config.minSpeakers ?? currentSettings.minSpeakers,
              max_speakers: config.maxSpeakers ?? currentSettings.maxSpeakers,
              use_speaker_colors: config.useSpeakerColors ?? currentSettings.useSpeakerColors,
              use_speaker_styled_translation:
                config.useSpeakerStyledTranslation ?? currentSettings.useSpeakerStyledTranslation,

              // Third-party API detection
              // is_third_party_openai: !!(
              //   currentSettings.openaiEndpoint && currentSettings.openaiEndpoint !== ''
              // ),
              is_third_party_gemini: !!(
                currentSettings.geminiEndpoint && currentSettings.geminiEndpoint !== ''
              ),

              // Step providers
              // provider_refinement: currentSettings.stepProviders?.refinement?.type || 'gemini',
              // provider_translation: currentSettings.stepProviders?.translation?.type || 'gemini',

              // Has custom prompts
              has_custom_translation_prompt: !!currentSettings.customTranslationPrompt?.trim(),
              has_custom_refinement_prompt: !!currentSettings.customRefinementPrompt?.trim(),

              // End-to-end specific
              enable_compression: config.enableCompression ?? false,

              // UI settings
              zoom_level: currentSettings.zoomLevel,
            },
            'interaction'
          );
        }

        // Guard: Very short audio (less than 1 second)
        if (audioBuffer.duration < 1) {
          logger.error('[EndToEnd] Audio too short', { duration: audioBuffer.duration });
          return { success: false, error: t('errors.audioTooShort'), errorCode: 'AUDIO_TOO_SHORT' };
        }

        // Guard: Very long audio (more than 6 hours)
        if (audioBuffer.duration > 6 * 60 * 60) {
          logger.error('[EndToEnd] Audio too long', { duration: audioBuffer.duration });
          return {
            success: false,
            error: t('errors.audioTooLong'),
            errorCode: 'AUDIO_TOO_LONG',
          };
        }

        // Check abort before expensive operation
        if (signal.aborted) {
          return { success: false, error: t('errors.cancelled'), errorCode: 'CANCELLED' };
        }

        // Send progress update and collect analytics from all chunks
        const sendProgress = (update: ChunkStatus) => {
          if (!signal.aborted) {
            window.electronAPI?.endToEnd?.sendSubtitleProgress?.(update);
          }
          // Collect analytics when present (completed, error, or cancelled chunks)
          if (update.analytics) {
            accumulatedChunkAnalytics.push(update.analytics);
          }
        };

        // Determine glossary terms based on user's explicit selection in E2E config
        // - If user selected a specific glossary (config.selectedGlossaryId is set), use its terms (even if empty)
        // - If user selected "(无)" (config.selectedGlossaryId is null/empty), use empty array (no global fallback)
        // - If config.selectedGlossaryId is undefined (not set in UI), fall back to global activeGlossaryId
        const hasExplicitGlossarySelection = config.selectedGlossaryId !== undefined;
        const selectedGlossary = config.selectedGlossaryId
          ? currentSettings.glossaries?.find((g) => g.id === config.selectedGlossaryId)
          : null;
        const glossaryTerms = hasExplicitGlossarySelection
          ? selectedGlossary?.terms || [] // Respect user choice (empty means empty)
          : getActiveGlossaryTerms(currentSettings); // No explicit choice, use global

        // Merge config with settings, applying end-to-end specific overrides
        const mergedSettings: AppSettings = {
          ...currentSettings,
          // Apply any config overrides from the wizard
          genre: config.genre ?? currentSettings.genre,
          enableAutoGlossary: config.enableGlossary ?? currentSettings.enableAutoGlossary,
          enableDiarization: config.enableDiarization ?? currentSettings.enableDiarization,
          enableSpeakerPreAnalysis:
            config.enableSpeakerPreAnalysis ?? currentSettings.enableSpeakerPreAnalysis,
          minSpeakers: config.minSpeakers ?? currentSettings.minSpeakers,
          maxSpeakers: config.maxSpeakers ?? currentSettings.maxSpeakers,
          useSpeakerColors: config.useSpeakerColors ?? currentSettings.useSpeakerColors,
          useSpeakerStyledTranslation:
            config.useSpeakerStyledTranslation ?? currentSettings.useSpeakerStyledTranslation,
          includeSpeakerInExport: config.includeSpeaker ?? currentSettings.includeSpeakerInExport,
          // Set glossary terms based on user's explicit choice
          glossary: glossaryTerms,
          activeGlossaryId: hasExplicitGlossarySelection
            ? config.selectedGlossaryId || null // Explicit choice (null means none selected)
            : currentSettings.activeGlossaryId, // No explicit choice, use global
          // For end-to-end mode, always auto-confirm glossary
          glossaryAutoConfirm: true,
        };

        // Generate subtitles
        const { subtitles, speakerProfiles, chunkAnalytics } = await generateSubtitles(
          audioBuffer,
          audioBuffer.duration,
          mergedSettings,
          sendProgress,
          undefined, // No intermediate result callback needed
          // Auto-confirm glossary callback for end-to-end mode (with persistence)
          async (metadata) => {
            logger.info('[EndToEnd] Auto-accepting glossary terms', {
              totalTerms: metadata.totalTerms,
            });

            const result = autoConfirmGlossaryTerms({
              metadata,
              settings: settingsRef.current,
              updateSetting: updateSettingRef.current,
              targetGlossaryId: config.selectedGlossaryId,
              fallbackTerms: mergedSettings.glossary || [],
              logPrefix: '[EndToEnd]',
            });

            return result.terms;
          },
          signal,
          // Video info for artifact metadata
          { filename: audioFileName, duration: audioBuffer.duration }
        );

        // Capture chunk analytics from result (should be same as accumulated but sorted)
        accumulatedChunkAnalytics = chunkAnalytics;

        // Guard: No subtitles generated
        if (!subtitles || subtitles.length === 0) {
          logger.warn('[EndToEnd] No subtitles generated');

          // Check if all failures were due to user-actionable errors (e.g., API quota exhausted)
          const failedChunks = chunkAnalytics.filter((c) => c.status === 'failed');
          const allFailuresUserActionable =
            failedChunks.length > 0 && failedChunks.every((c) => c.isUserActionable);

          if (allFailuresUserActionable) {
            // Return rate limit error instead of generic "no speech" error
            return {
              success: false,
              error: t('errors.rateLimited'),
              errorCode: 'RATE_LIMITED',
            };
          }

          return {
            success: false,
            error: t('errors.noSpeech'),
            errorCode: 'NO_SPEECH',
          };
        }

        logger.info('[EndToEnd] Subtitle generation complete', { count: subtitles.length });

        // Generate content string
        const format = config.subtitleFormat || 'ass';
        const outputMode = config.outputMode || 'bilingual';
        const bilingual = outputMode === 'bilingual';
        const title = config.videoInfo?.title || 'video';

        let content = '';
        if (format === 'srt') {
          content = generateSrtContent(subtitles, bilingual, !!config.includeSpeaker);
        } else {
          content = generateAssContent(
            subtitles,
            title,
            bilingual,
            !!config.includeSpeaker,
            !!config.useSpeakerColors,
            speakerProfiles,
            config.targetLanguage
          );
        }

        // Analytics: End-to-End Generation Completed
        if (window.electronAPI?.analytics) {
          void window.electronAPI.analytics.track(
            'end_to_end_generation_completed',
            {
              count: subtitles.length,
              duration_ms: Date.now() - startTime,
              chunk_durations: chunkAnalytics,
            },
            'interaction'
          );
        }

        // Return subtitles and content to main process
        return {
          success: true,
          subtitles,
          subtitleContent: content,
          subtitleFormat: format,
          chunkAnalytics,
        };
      } catch (error: any) {
        // Ensure analytics are sorted by index
        accumulatedChunkAnalytics.sort((a, b) => a.index - b.index);

        // Categorize error types
        // Check for cancellation first to avoid error logging
        if (error.name === 'AbortError' || error.message?.includes('cancelled') || signal.aborted) {
          logger.info('[EndToEnd] Subtitle generation cancelled');

          // Analytics: End-to-End Generation Cancelled
          if (window.electronAPI?.analytics) {
            void window.electronAPI.analytics.track(
              'end_to_end_generation_cancelled',
              {
                duration_ms: Date.now() - startTime,
                chunk_durations: accumulatedChunkAnalytics, // Use accumulated analytics
              },
              'interaction'
            );
          }

          return { success: false, error: t('errors.cancelled'), errorCode: 'CANCELLED' };
        }

        logger.error('[EndToEnd] Subtitle generation failed', error);

        // Analytics: End-to-End Generation Failed
        if (window.electronAPI?.analytics) {
          let errorCode = 'UNKNOWN';
          if (error instanceof UserActionableError) {
            const msg = error.message.toLowerCase();
            if (msg.includes('key') || msg.includes('密钥')) errorCode = 'API_KEY_ERROR';
            else if (
              msg.includes('rate') ||
              msg.includes('quota') ||
              msg.includes('频率') ||
              msg.includes('配额')
            )
              errorCode = 'RATE_LIMITED';
            else errorCode = 'USER_ACTION_REQUIRED';
          } else if (error.message?.includes('timeout') || error.message?.includes('超时')) {
            errorCode = 'TIMEOUT';
          }

          void window.electronAPI.analytics.track(
            'end_to_end_generation_failed',
            {
              error: error.message || 'Unknown error',
              stage: 'generation', // We are in the generation phase here
              error_code: errorCode,
              chunk_durations: accumulatedChunkAnalytics, // Include partial chunk stats
            },
            'interaction'
          );
        }

        // Sentry: Report error with context
        // Only report if it's not a known expected error
        if (
          !(error instanceof UserActionableError) &&
          !(error instanceof ExpectedError) &&
          !(error as any).isExpected
        ) {
          Sentry.captureException(error, {
            tags: { source: 'end_to_end_generation' },
          });
        }

        // Return user-friendly error based on error type
        if (error instanceof UserActionableError) {
          // UserActionableError already has a user-friendly message
          const msg = error.message.toLowerCase();
          if (msg.includes('key') || msg.includes('密钥')) {
            return { success: false, error: t('errors.invalidApiKey'), errorCode: 'API_KEY_ERROR' };
          }
          if (
            msg.includes('rate') ||
            msg.includes('quota') ||
            msg.includes('频率') ||
            msg.includes('配额')
          ) {
            return { success: false, error: t('errors.rateLimited'), errorCode: 'RATE_LIMITED' };
          }
          // Generic user-actionable error
          return { success: false, error: error.message, errorCode: 'USER_ACTION_REQUIRED' };
        }

        if (error.message?.includes('timeout') || error.message?.includes('超时')) {
          return { success: false, error: t('errors.timeout'), errorCode: 'TIMEOUT' };
        }

        return {
          success: false,
          error: error.message || t('errors.unknown'),
          errorCode: 'UNKNOWN',
        };
      } finally {
        clearTimeout(timeoutId);
        isProcessingRef.current = false;
        abortControllerRef.current = null;
      }
    },
    [loadAudioFromPath, t] // Only depends on loadAudioFromPath; settings/updateSetting accessed via refs
  );

  /**
   * Handle generation request from main process
   */
  const handleGenerateRequest = useCallback(
    async (data: { config: any; videoPath: string; audioPath: string }) => {
      logger.info('[EndToEnd] Received subtitle generation request', data);

      const result = await executeGeneration(data.config, data.audioPath);

      // Send result back to main process
      window.electronAPI?.endToEnd?.sendSubtitleResult?.(result);
    },
    [executeGeneration]
  );

  // Set up IPC listener
  useEffect(() => {
    if (!window.electronAPI?.endToEnd?.onGenerateSubtitles) {
      logger.debug('[EndToEnd] Subtitle generation listener not available (web mode)');
      return;
    }

    logger.info('[EndToEnd] Setting up subtitle generation listener');

    const unsubscribeGenerate =
      window.electronAPI.endToEnd.onGenerateSubtitles(handleGenerateRequest);

    let unsubscribeAbort: (() => void) | undefined;
    if (window.electronAPI.endToEnd.onAbortSubtitleGeneration) {
      unsubscribeAbort = window.electronAPI.endToEnd.onAbortSubtitleGeneration(() => {
        logger.info('[EndToEnd] Received abort signal from main process');
        if (isProcessingRef.current && abortControllerRef.current) {
          abortControllerRef.current.abort();
        }
      });
    }

    return () => {
      logger.info('[EndToEnd] Cleaning up subtitle generation listener');
      unsubscribeGenerate();
      if (unsubscribeAbort) {
        unsubscribeAbort();
      }

      // Abort any ongoing operation
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [handleGenerateRequest]); // Depend on handleGenerateRequest which is memoized

  return {
    isProcessing: isProcessingRef.current,
  };
}
