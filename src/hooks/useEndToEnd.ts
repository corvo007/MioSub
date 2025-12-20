/**
 * useEndToEnd Hook
 * 端到端模式状态管理 Hook
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  EndToEndConfig,
  PipelineProgress,
  PipelineResult,
  WizardState,
  WizardStep,
} from '@/types/endToEnd';
import type { VideoInfo } from '@electron/services/ytdlp';

// Re-export types for convenience
export type { EndToEndConfig, PipelineProgress, PipelineResult, WizardStep };

interface UseEndToEndReturn {
  // State
  state: WizardState;

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
  startPipeline: () => Promise<PipelineResult | null>;
  abortPipeline: () => void;
  resetToConfig: () => void;
  retryPipeline: () => Promise<PipelineResult | null>;

  // Status
  canRetry: boolean;
  isElectron: boolean;
}

const DEFAULT_CONFIG: Partial<EndToEndConfig> = {
  downloadThumbnail: true,
  sourceLanguage: 'ja',
  targetLanguage: 'zh-CN',
  genre: 'general',
  useLocalWhisper: false,
  enableGlossary: true,
  enableDiarization: true,
  enableSpeakerPreAnalysis: true,
  includeSpeaker: false,
  useSpeakerColors: true,
  useSpeakerStyledTranslation: true,
  enableCompression: true,
  compressionEncoder: 'libx264',
  compressionCrf: 23,
  compressionResolution: 'original',
  useHardwareAccel: true,
  embedSubtitle: true,
  outputMode: 'bilingual',
  subtitleFormat: 'ass',
};

export function useEndToEnd(): UseEndToEndReturn {
  const isElectron = typeof window !== 'undefined' && !!window.electronAPI?.isElectron;

  // State
  const [state, setState] = useState<WizardState>({
    currentStep: 'input',
    config: { ...DEFAULT_CONFIG },
    isParsing: false,
    isExecuting: false,
  });

  // Refs for cleanup
  const progressUnsubscribeRef = useRef<(() => void) | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (progressUnsubscribeRef.current) {
        progressUnsubscribeRef.current();
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
  }, []);

  // URL Parsing
  const parseUrl = useCallback(
    async (url: string) => {
      if (!isElectron || !window.electronAPI?.download?.parse) {
        throw new Error('此功能仅在桌面版可用');
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
        const parsePromise = window.electronAPI.download.parse(url);
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('解析超时，请检查网络连接后重试')), PARSE_TIMEOUT_MS)
        );

        const result = await Promise.race([parsePromise, timeoutPromise]);

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
            parseError: result.error || '解析视频链接失败',
          }));
        }
      } catch (error: any) {
        setState((prev) => ({
          ...prev,
          isParsing: false,
          parseError: error.message || '解析视频链接时发生错误',
        }));
      }
    },
    [isElectron]
  );

  // Pipeline execution
  const startPipeline = useCallback(async (): Promise<PipelineResult | null> => {
    if (!isElectron || !window.electronAPI?.endToEnd?.start) {
      throw new Error('此功能仅在桌面版可用');
    }

    // Validate config
    const config = state.config as EndToEndConfig;
    if (!config.url) {
      throw new Error('请输入视频链接');
    }
    if (!config.outputDir) {
      throw new Error('请选择输出目录');
    }

    setState((prev) => ({
      ...prev,
      isExecuting: true,
      currentStep: 'progress',
      progress: {
        stage: 'idle',
        stageProgress: 0,
        overallProgress: 0,
        message: '正在初始化...',
      },
    }));

    try {
      // Include videoInfo in config to avoid re-parsing
      const configWithVideoInfo = {
        ...config,
        videoInfo: state.videoInfo,
      };
      const result = await window.electronAPI.endToEnd.start(configWithVideoInfo);

      setState((prev) => ({
        ...prev,
        isExecuting: false,
        currentStep: 'result',
        result: result as PipelineResult,
      }));

      return result as PipelineResult;
    } catch (error: any) {
      const errorResult = {
        success: false,
        finalStage: 'failed' as const,
        outputs: {},
        duration: 0,
        error: error.message || '执行失败',
      } as PipelineResult;

      setState((prev) => ({
        ...prev,
        isExecuting: false,
        currentStep: 'result',
        result: errorResult,
      }));

      return errorResult;
    }
  }, [isElectron, state.config, state.videoInfo]);

  const abortPipeline = useCallback(() => {
    if (!isElectron || !window.electronAPI?.endToEnd?.abort) return;

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

  return {
    state,
    setStep,
    goNext,
    goBack,
    updateConfig,
    resetConfig,
    parseUrl,
    videoInfo: state.videoInfo || null,
    startPipeline,
    abortPipeline,
    resetToConfig,
    retryPipeline,
    canRetry: !!canRetry,
    isElectron,
  };
}
