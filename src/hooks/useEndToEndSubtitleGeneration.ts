/**
 * End-to-End Subtitle Generation Handler
 * 用于处理主进程发送的字幕生成请求
 */

import { useEffect, useCallback, useRef } from 'react';
import { generateSubtitles } from '@/services/api/gemini/subtitle';
import { generateAssContent, generateSrtContent } from '@/services/subtitle/generator';
import { decodeAudioWithRetry } from '@/services/audio/decoder';
import { logger } from '@/services/utils/logger';
import type { AppSettings } from '@/types/settings';
import type { SubtitleItem } from '@/types/subtitle';
import type { ChunkStatus } from '@/types/api';

interface UseEndToEndSubtitleGenerationProps {
  settings: AppSettings;
}

/**
 * Hook that listens for end-to-end subtitle generation requests from main process
 * and executes the generation pipeline
 */
export function useEndToEndSubtitleGeneration({ settings }: UseEndToEndSubtitleGenerationProps) {
  const isProcessingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

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
        return { success: false, error: '已有任务在处理中', errorCode: 'BUSY' };
      }

      // Guard: Missing audio path
      if (!audioPath || typeof audioPath !== 'string') {
        logger.error('[EndToEnd] Invalid audio path', { audioPath });
        return { success: false, error: '无效的音频路径', errorCode: 'INVALID_PATH' };
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

        // Validate API keys before starting
        const hasGeminiKey = settings.geminiKey?.trim() || process.env.VITE_GEMINI_API_KEY;
        const hasOpenAIKey = settings.openaiKey?.trim() || process.env.VITE_OPENAI_API_KEY;

        if (!hasGeminiKey) {
          return {
            success: false,
            error: '缺少 Gemini API 密钥，请在设置中配置',
            errorCode: 'MISSING_API_KEY',
          };
        }
        if (!hasOpenAIKey && !settings.useLocalWhisper) {
          return {
            success: false,
            error: '缺少 OpenAI API 密钥或未配置本地 Whisper',
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
            error: `无法读取音频文件: ${loadError.message}`,
            errorCode: 'FILE_READ_ERROR',
          };
        }

        // Guard: Empty audio file
        if (audioFile.size === 0) {
          logger.error('[EndToEnd] Audio file is empty');
          return { success: false, error: '音频文件为空', errorCode: 'EMPTY_FILE' };
        }

        // Guard: File too small (likely corrupted, less than 1KB)
        if (audioFile.size < 1024) {
          logger.warn('[EndToEnd] Audio file suspiciously small', { size: audioFile.size });
          return { success: false, error: '音频文件过小，可能已损坏', errorCode: 'CORRUPT_FILE' };
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
            error: `音频解码失败: ${decodeError.message}`,
            errorCode: 'DECODE_ERROR',
          };
        }

        // Guard: Very short audio (less than 1 second)
        if (audioBuffer.duration < 1) {
          logger.error('[EndToEnd] Audio too short', { duration: audioBuffer.duration });
          return { success: false, error: '音频时长过短（少于1秒）', errorCode: 'AUDIO_TOO_SHORT' };
        }

        // Guard: Very long audio (more than 6 hours)
        if (audioBuffer.duration > 6 * 60 * 60) {
          logger.error('[EndToEnd] Audio too long', { duration: audioBuffer.duration });
          return {
            success: false,
            error: '音频时长过长（超过6小时）',
            errorCode: 'AUDIO_TOO_LONG',
          };
        }

        // Check abort before expensive operation
        if (signal.aborted) {
          return { success: false, error: '操作已取消', errorCode: 'CANCELLED' };
        }

        // Send progress update
        const sendProgress = (update: ChunkStatus) => {
          if (!signal.aborted) {
            window.electronAPI?.endToEnd?.sendSubtitleProgress?.(update);
          }
        };

        // Merge config with settings, applying end-to-end specific overrides
        const mergedSettings: AppSettings = {
          ...settings,
          // Apply any config overrides from the wizard
          enableAutoGlossary: config.enableGlossary ?? settings.enableAutoGlossary,
          enableDiarization: config.enableDiarization ?? settings.enableDiarization,
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
          // Auto-confirm glossary callback for end-to-end mode
          async (metadata) => {
            logger.info('[EndToEnd] Auto-accepting glossary terms', {
              totalTerms: metadata.totalTerms,
            });
            // Auto-accept: merge extracted terms with existing glossary
            const extractedTerms =
              metadata.results
                ?.flatMap((r) => r.terms || [])
                .filter((t) => t.term && t.translation) || [];
            return [...(mergedSettings.glossary || []), ...extractedTerms];
          },
          signal
        );

        // Guard: No subtitles generated
        if (!subtitles || subtitles.length === 0) {
          logger.warn('[EndToEnd] No subtitles generated');
          return {
            success: false,
            error: '未生成任何字幕，音频可能无语音内容',
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
          return { success: false, error: '操作已取消', errorCode: 'CANCELLED' };
        }

        if (error.message?.includes('API key') || error.message?.includes('密钥')) {
          return { success: false, error: error.message, errorCode: 'API_KEY_ERROR' };
        }

        if (error.message?.includes('rate limit') || error.message?.includes('429')) {
          return {
            success: false,
            error: 'API 请求频率限制，请稍后重试',
            errorCode: 'RATE_LIMITED',
          };
        }

        if (error.message?.includes('timeout') || error.message?.includes('超时')) {
          return { success: false, error: '请求超时，请检查网络连接', errorCode: 'TIMEOUT' };
        }

        return { success: false, error: error.message || '字幕生成失败', errorCode: 'UNKNOWN' };
      } finally {
        clearTimeout(timeoutId);
        isProcessingRef.current = false;
        abortControllerRef.current = null;
      }
    },
    [settings, loadAudioFromPath]
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

    const unsubscribe = window.electronAPI.endToEnd.onGenerateSubtitles(handleGenerateRequest);

    return () => {
      logger.info('[EndToEnd] Cleaning up subtitle generation listener');
      unsubscribe();

      // Abort any ongoing operation
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [handleGenerateRequest]);

  return {
    isProcessing: isProcessingRef.current,
  };
}
