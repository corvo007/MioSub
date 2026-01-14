/**
 * End-to-End Subtitle Generation Handler
 * 用于处理主进程发送的字幕生成请求
 */

import { useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { generateSubtitles } from '@/services/generation/pipeline';
import { generateAssContent, generateSrtContent } from '@/services/subtitle/generator';
import { decodeAudioWithRetry } from '@/services/audio/decoder';
import { autoConfirmGlossaryTerms } from '@/services/glossary/autoConfirm';
import { getActiveGlossaryTerms } from '@/services/glossary/utils';
import { logger } from '@/services/utils/logger';
import type { AppSettings } from '@/types/settings';
import type { SubtitleItem } from '@/types/subtitle';
import type { ChunkStatus } from '@/types/api';

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
      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;

      // Timeout protection (30 minutes max)
      const timeoutMs = 30 * 60 * 1000;
      const timeoutId = setTimeout(() => {
        logger.warn('[EndToEnd] Generation timeout, aborting');
        abortControllerRef.current?.abort();
      }, timeoutMs);

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
        try {
          audioBuffer = await decodeAudioWithRetry(audioFile);
          logger.info('[EndToEnd] Audio decoded', { duration: audioBuffer.duration });
        } catch (decodeError: any) {
          logger.error('[EndToEnd] Failed to decode audio', decodeError);
          return {
            success: false,
            error: t('errors.decodeError', { error: decodeError.message }),
            errorCode: 'DECODE_ERROR',
          };
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

        // Send progress update
        const sendProgress = (update: ChunkStatus) => {
          if (!signal.aborted) {
            window.electronAPI?.endToEnd?.sendSubtitleProgress?.(update);
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
        const { subtitles } = await generateSubtitles(
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
          { filename: audioFile.name, duration: audioBuffer.duration }
        );

        // Guard: No subtitles generated
        if (!subtitles || subtitles.length === 0) {
          logger.warn('[EndToEnd] No subtitles generated');
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
            !!config.useSpeakerColors
          );
        }

        // Return subtitles and content to main process
        return {
          success: true,
          subtitles,
          subtitleContent: content,
          subtitleFormat: format,
        };
      } catch (error: any) {
        logger.error('[EndToEnd] Subtitle generation failed', error);

        // Categorize error types
        if (error.name === 'AbortError' || error.message?.includes('cancelled') || signal.aborted) {
          return { success: false, error: t('errors.cancelled'), errorCode: 'CANCELLED' };
        }

        if (error.message?.includes('API key') || error.message?.includes('密钥')) {
          return { success: false, error: t('errors.invalidApiKey'), errorCode: 'API_KEY_ERROR' };
        }

        if (error.message?.includes('rate limit') || error.message?.includes('429')) {
          return {
            success: false,
            error: t('errors.rateLimited'),
            errorCode: 'RATE_LIMITED',
          };
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
