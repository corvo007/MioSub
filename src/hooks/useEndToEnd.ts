/**
 * useEndToEnd Hook
 * 端到端模式状态管理 Hook
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  EndToEndConfig,
  PipelineProgress,
  PipelineResult,
  WizardState,
  WizardStep,
} from '@/types/endToEnd';
import type { PreflightError } from '@/types/electron';
import type { VideoInfo } from '@electron/services/ytdlp';
import type { AppSettings } from '@/types/settings';
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback';
import { logger } from '@/services/utils/logger';
import { getReadableErrorMessage } from '@/services/utils/errors';
import { ENV } from '@/config';

// Re-export types for convenience
export type { EndToEndConfig, PipelineProgress, PipelineResult, WizardStep };

interface UseEndToEndReturn {
  // State
  state: WizardState;

  // Preflight errors
  preflightErrors: PreflightError[];
  clearPreflightErrors: () => void;
  preflightContinueCallback: (() => void) | null;

  // Navigation
  setStep: (step: WizardStep) => void;
  goNext: () => void;
  goBack: () => void;

  // Config
  updateConfig: (updates: Partial<EndToEndConfig>) => void;
  resetConfig: () => void;

  // URL Parsing
  parseUrl: (url: string) => Promise<void>;
  videoInfo: VideoInfo | null;

  // Pipeline execution
  startPipeline: (globalSettings?: AppSettings) => Promise<PipelineResult | null>;
  abortPipeline: () => void;
  resetToConfig: () => void;
  retryPipeline: () => Promise<PipelineResult | null>;

  // Status
  canRetry: boolean;
  isElectron: boolean;
}

const DEFAULT_CONFIG: Partial<EndToEndConfig> = {
  downloadThumbnail: true,
  targetLanguage: 'zh-CN',
  minSpeakers: undefined,
  maxSpeakers: undefined,
  // Feature Toggles (Global settings handled in SettingsModal)
  enableCompression: true,
  compressionEncoder: 'libx264',
  compressionCrf: 23,
  compressionResolution: 'original',
  useHardwareAccel: true,
  embedSubtitle: true,
  subtitleFormat: 'ass',
};

export function useEndToEnd(): UseEndToEndReturn {
  const { t } = useTranslation('endToEnd');
  const isElectron = typeof window !== 'undefined' && !!window.electronAPI?.isElectron;

  // State
  const [state, setState] = useState<WizardState>({
    currentStep: 'input',
    config: { ...DEFAULT_CONFIG },
    isParsing: false,
    isExecuting: false,
  });

  // Preflight errors state
  const [preflightErrors, setPreflightErrors] = useState<PreflightError[]>([]);
  const [preflightContinueCallback, setPreflightContinueCallback] = useState<(() => void) | null>(
    null
  );
  const skipPreflightRef = useRef(false);

  // Refs for cleanup
  const progressUnsubscribeRef = useRef<(() => void) | null>(null);
  const parsingUrlRef = useRef<string | null>(null);
  const taskIdRef = useRef<string | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (progressUnsubscribeRef.current) {
        progressUnsubscribeRef.current();
      }
      // Cancel pending parse on unmount
      if (parsingUrlRef.current && window.electronAPI?.download?.cancelParse) {
        window.electronAPI.download.cancelParse(parsingUrlRef.current).catch(console.error);
      }
      // Unregister task on unmount
      if (taskIdRef.current && window.electronAPI?.task?.unregister) {
        window.electronAPI.task.unregister(taskIdRef.current).catch(console.error);
        taskIdRef.current = null;
      }
    };
  }, []);

  // Subscribe to progress updates
  useEffect(() => {
    if (!isElectron || !window.electronAPI?.endToEnd) return;

    progressUnsubscribeRef.current = window.electronAPI.endToEnd.onProgress((progress: any) => {
      setState((prev) => ({
        ...prev,
        progress: progress as PipelineProgress,
      }));
    });

    return () => {
      if (progressUnsubscribeRef.current) {
        progressUnsubscribeRef.current();
        progressUnsubscribeRef.current = null;
      }
    };
  }, [isElectron]);

  // Navigation
  const setStep = useCallback((step: WizardStep) => {
    setState((prev) => ({ ...prev, currentStep: step }));
  }, []);

  const goNext = useCallback(() => {
    setState((prev) => {
      const steps: WizardStep[] = ['input', 'config', 'progress', 'result'];
      const currentIndex = steps.indexOf(prev.currentStep);
      if (currentIndex < steps.length - 1) {
        return { ...prev, currentStep: steps[currentIndex + 1] };
      }
      return prev;
    });
  }, []);

  const goBack = useCallback(() => {
    setState((prev) => {
      const steps: WizardStep[] = ['input', 'config', 'progress', 'result'];
      const currentIndex = steps.indexOf(prev.currentStep);
      if (currentIndex > 0) {
        return { ...prev, currentStep: steps[currentIndex - 1] };
      }
      return prev;
    });
  }, []);

  // Config management
  const updateConfig = useCallback((updates: Partial<EndToEndConfig>) => {
    setState((prev) => ({
      ...prev,
      config: { ...prev.config, ...updates },
    }));
  }, []);

  const resetConfig = useCallback(() => {
    setState({
      currentStep: 'input',
      config: { ...DEFAULT_CONFIG },
      isParsing: false,
      isExecuting: false,
      videoInfo: undefined,
      progress: undefined,
      result: undefined,
      parseError: undefined,
    });
    setPreflightErrors([]);
  }, []);

  // URL Parsing
  const parseUrl = useCallback(
    async (url: string) => {
      if (!isElectron || !window.electronAPI?.download?.parse) {
        throw new Error(t('errors.desktopOnly'));
      }

      setState((prev) => ({
        ...prev,
        isParsing: true,
        parseError: undefined,
        config: { ...prev.config, url },
      }));

      // Timeout protection to prevent UI from hanging on slow networks
      const PARSE_TIMEOUT_MS = 60000; // 60 seconds

      try {
        // Track whether we've already handled the result to prevent double-handling
        let handled = false;
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        parsingUrlRef.current = url;

        const parsePromise = window.electronAPI.download.parse(url);

        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => {
            if (!handled) {
              reject(new Error(t('errors.parseTimeout')));
            }
          }, PARSE_TIMEOUT_MS);
        });

        try {
          const result = await Promise.race([parsePromise, timeoutPromise]);
          handled = true;
          if (timeoutId) clearTimeout(timeoutId);

          if (result.success && result.videoInfo) {
            setState((prev) => ({
              ...prev,
              isParsing: false,
              videoInfo: result.videoInfo,
              currentStep: 'config', // 解析成功后自动跳转到配置步骤
            }));
          } else {
            setState((prev) => ({
              ...prev,
              isParsing: false,
              parseError: result.error || t('errors.parseError'),
            }));
          }
        } catch (raceError: any) {
          // Timeout or parse error
          handled = true;
          if (timeoutId) clearTimeout(timeoutId);
          throw raceError;
        } finally {
          parsingUrlRef.current = null;
          setState((prev) => ({ ...prev, isParsing: false }));
        }
      } catch (error: any) {
        // Handle timeout specifically
        if (error.message === t('errors.parseTimeout')) {
          logger.error('[EndToEnd] Parse timeout', { url });
          if (window.electronAPI?.download?.cancelParse) {
            window.electronAPI.download.cancelParse(url).catch(console.error);
          }
        } else {
          logger.error(`[EndToEnd] Parse failed: ${error.message}`, { url });
        }

        setState((prev) => ({
          ...prev,
          isParsing: false,
          parseError: error.message,
        }));
      }
    },
    [isElectron, t]
  );

  // Pipeline execution
  const startPipeline = useCallback(
    async (globalSettings?: AppSettings): Promise<PipelineResult | null> => {
      if (!isElectron || !window.electronAPI?.endToEnd?.start) {
        throw new Error(t('errors.desktopOnly'));
      }

      // Validate config
      const config = state.config as EndToEndConfig;
      if (!config.url) {
        throw new Error(t('errors.enterUrl'));
      }
      if (!config.outputDir) {
        throw new Error(t('errors.selectOutputDir'));
      }

      // Run preflight check before starting pipeline
      if (window.electronAPI?.preflight && globalSettings && !skipPreflightRef.current) {
        // Only fetch aligner version when CTC alignment is active (avoids unnecessary IPC)
        let alignerVersion: string | undefined;
        if (globalSettings.alignmentMode === 'ctc') {
          const binInfo = await window.electronAPI.binaries?.getInfo?.();
          alignerVersion = binInfo?.versions?.aligner;
        }
        const preflight = await window.electronAPI.preflight.check({
          geminiKey: globalSettings.geminiKey || ENV.GEMINI_API_KEY,
          openaiKey: globalSettings.openaiKey || ENV.OPENAI_API_KEY,
          useLocalWhisper: globalSettings.useLocalWhisper,
          whisperModelPath: globalSettings.whisperModelPath,
          localWhisperBinaryPath: globalSettings.localWhisperBinaryPath,
          alignmentMode: globalSettings.alignmentMode,
          alignmentModelPath: globalSettings.alignmentModelPath,
          alignerPath: globalSettings.alignerPath,
          alignerVersion,
        });

        if (!preflight.passed) {
          // Set preflight errors for modal display
          setPreflightErrors(preflight.errors as PreflightError[]);
          return null;
        }

        // Warnings only (no errors) — show modal with "Continue Anyway"
        if (preflight.warnings?.length > 0) {
          setPreflightErrors(
            preflight.warnings.map((w: { code: string; message: string; field?: string }) => ({
              ...w,
              severity: 'warning' as const,
            }))
          );
          setPreflightContinueCallback(() => () => {
            skipPreflightRef.current = true;
            startPipeline(globalSettings);
          });
          return null;
        }
      }
      skipPreflightRef.current = false;

      setState((prev) => ({
        ...prev,
        isExecuting: true,
        currentStep: 'progress',
        progress: {
          stage: 'idle',
          stageProgress: 0,
          overallProgress: 0,
          message: t('status.initializing'),
        },
      }));

      // Register task for close confirmation
      const taskId = `e2e-${Date.now()}`;
      taskIdRef.current = taskId;
      const videoTitle = state.videoInfo?.title || config.url;
      window.electronAPI?.task
        ?.register(taskId, 'end_to_end', `${t('task.processing')}: ${videoTitle}`)
        .catch(console.error);

      try {
        // Merge global settings into config to ensure user preferences are respected
        const mergedConfig = {
          ...config,
          // Map global settings to EndToEndConfig fields
          enableDiarization: globalSettings?.enableDiarization ?? config.enableDiarization ?? true,
          enableSpeakerPreAnalysis:
            globalSettings?.enableSpeakerPreAnalysis ?? config.enableSpeakerPreAnalysis ?? true,
          includeSpeaker: globalSettings?.includeSpeakerInExport ?? config.includeSpeaker ?? false,
          useSpeakerColors: globalSettings?.useSpeakerColors ?? config.useSpeakerColors ?? true,
          useSpeakerStyledTranslation:
            globalSettings?.useSpeakerStyledTranslation ??
            config.useSpeakerStyledTranslation ??
            true,
          enableGlossary: globalSettings?.enableAutoGlossary ?? config.enableGlossary ?? true,
          outputMode: globalSettings?.outputMode ?? config.outputMode ?? 'bilingual',
          // Include videoInfo to avoid re-parsing
          videoInfo: state.videoInfo,
        };

        const result = await window.electronAPI.endToEnd.start(mergedConfig);

        // Unregister task on completion
        if (taskIdRef.current) {
          window.electronAPI?.task?.unregister(taskIdRef.current).catch(console.error);
          taskIdRef.current = null;
        }

        setState((prev) => ({
          ...prev,
          isExecuting: false,
          currentStep: 'result',
          result: result as PipelineResult,
        }));

        return result as PipelineResult;
      } catch (error: any) {
        // Unregister task on error
        if (taskIdRef.current) {
          window.electronAPI?.task?.unregister(taskIdRef.current).catch(console.error);
          taskIdRef.current = null;
        }

        const errorMessage = getReadableErrorMessage(error) || t('errors.executionFailed');
        logger.error(`[EndToEnd] Pipeline execution failed: ${errorMessage}`, error);

        const errorResult = {
          success: false,
          finalStage: 'failed' as const,
          outputs: {},
          duration: 0,
          error: errorMessage,
        } as PipelineResult;

        setState((prev) => ({
          ...prev,
          isExecuting: false,
          currentStep: 'result',
          result: errorResult,
        }));

        return errorResult;
      }
    },
    [isElectron, state.config, state.videoInfo, t]
  );

  const abortPipeline = useCallback(() => {
    if (!isElectron || !window.electronAPI?.endToEnd?.abort) return;

    // Unregister task on abort
    if (taskIdRef.current) {
      window.electronAPI?.task?.unregister(taskIdRef.current).catch(console.error);
      taskIdRef.current = null;
    }

    void window.electronAPI.endToEnd.abort();
    setState((prev) => ({
      ...prev,
      isExecuting: false,
    }));
  }, [isElectron]);

  // Reset to config step (for manual retry with config changes)
  const resetToConfig = useCallback(() => {
    setState((prev) => ({
      ...prev,
      currentStep: 'config',
      progress: undefined,
      result: undefined,
      isExecuting: false,
    }));
  }, []);

  // True retry: clear error and immediately restart pipeline
  const retryPipeline = useCallback(async () => {
    // Clear error state
    setState((prev) => ({
      ...prev,
      progress: undefined,
      result: undefined,
    }));

    // Immediately restart with same config
    return startPipeline();
  }, [startPipeline]);

  // Check if current state allows retry
  const canRetry = state.result && !state.result.success && state.result.errorDetails?.retryable;

  // Clear preflight errors
  const clearPreflightErrors = useCallback(() => {
    setPreflightErrors([]);
    setPreflightContinueCallback(null);
  }, []);

  // 防抖版本 - 防止快速重复点击
  const debouncedParseUrl = useDebouncedCallback(parseUrl);
  const debouncedStartPipeline = useDebouncedCallback(startPipeline);

  return {
    state,
    preflightErrors,
    clearPreflightErrors,
    preflightContinueCallback,
    setStep,
    goNext,
    goBack,
    updateConfig,
    resetConfig,
    parseUrl: debouncedParseUrl,
    videoInfo: state.videoInfo || null,
    startPipeline: debouncedStartPipeline,
    abortPipeline,
    resetToConfig,
    retryPipeline,
    canRetry: !!canRetry,
    isElectron,
  };
}
