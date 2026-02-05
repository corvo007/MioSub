/**
 * useDownload Hook - Video Download State Management
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { VideoInfo, DownloadProgress, DownloadStatus, DownloadError } from '@/types/download';
import {
  parseVideoUrl,
  startDownload,
  cancelDownload,
  selectOutputDir,
  getDefaultOutputDir,
  onDownloadProgress,
  downloadThumbnail as downloadThumbnailService,
} from '@/services/download';
import { logger } from '@/services/utils/logger';
import { useAppStore } from '@/store/useAppStore';
import { useProgressSmoothing } from '@/hooks/useProgressSmoothing';

interface UseDownloadReturn {
  // State
  status: DownloadStatus;
  videoInfo: VideoInfo | null;
  progress: DownloadProgress | null;
  outputDir: string;
  error: string | null;
  errorInfo: DownloadError | null;
  outputPath: string | null;
  thumbnailPath: string | null;
  lastUrl: string;

  // Actions
  parse: (url: string) => Promise<void>;
  download: (formatId: string) => Promise<string | undefined>;
  downloadThumbnail: () => Promise<string | undefined>;
  cancel: () => Promise<void>;
  selectDir: () => Promise<void>;
  reset: () => void;
  retry: () => Promise<void>;
}

export function useDownload(): UseDownloadReturn {
  const { t } = useTranslation(['download']);
  const addToast = useAppStore((s) => s.addToast);
  const [status, setStatus] = useState<DownloadStatus>('idle');
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [rawProgress, setRawProgress] = useState<DownloadProgress | null>(null);
  const [outputDir, setOutputDir] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [errorInfo, setErrorInfo] = useState<DownloadError | null>(null);
  const [outputPath, setOutputPath] = useState<string | null>(null);
  const [thumbnailPath, setThumbnailPath] = useState<string | null>(null);
  const [currentUrl, setCurrentUrl] = useState<string>('');
  const [lastFormatId, setLastFormatId] = useState<string>('');
  const taskIdRef = useRef<string | null>(null);

  // Apply progress smoothing with stage-based reset
  const { smoothed: progress, reset: resetProgress } = useProgressSmoothing(rawProgress, {
    interpolationSpeed: 0.1,
    resetOnFieldChange: 'stage',
  });

  // Initialize default output directory
  useEffect(() => {
    // Check if download API is available before calling
    if (window.electronAPI?.download) {
      getDefaultOutputDir()
        .then(setOutputDir)
        .catch((err) => logger.error('[useDownload] Failed to get default output dir', err));
    }
  }, []);

  // Subscribe to progress updates
  useEffect(() => {
    // Check if download API is available before subscribing
    if (!window.electronAPI?.download) {
      return () => {};
    }
    const unsubscribe = onDownloadProgress(setRawProgress);
    return unsubscribe;
  }, []);

  // Cleanup task on unmount
  useEffect(() => {
    return () => {
      if (taskIdRef.current && window.electronAPI?.task?.unregister) {
        window.electronAPI.task.unregister(taskIdRef.current).catch(console.error);
        taskIdRef.current = null;
      }
    };
  }, []);

  const parse = useCallback(async (url: string) => {
    setStatus('parsing');
    setError(null);
    setErrorInfo(null);
    setVideoInfo(null);
    setThumbnailPath(null);
    setCurrentUrl(url);
    try {
      const info = await parseVideoUrl(url);
      setVideoInfo(info);
      setStatus('idle');
    } catch (err: any) {
      // Check if error contains errorInfo from backend
      const errInfo = err.errorInfo as DownloadError | undefined;
      const errorMessage = errInfo?.message || err.message;
      logger.error(`[Download] Parse failed: ${errorMessage}`, { err, errInfo });
      setError(errorMessage);
      setErrorInfo(errInfo || null);
      setStatus('error');
    }
  }, []);

  const download = useCallback(
    async (formatId: string): Promise<string | undefined> => {
      if (!currentUrl || !outputDir) return;

      setStatus('downloading');
      setError(null);
      setErrorInfo(null);
      setRawProgress(null);
      resetProgress();
      setLastFormatId(formatId);

      // Generate task ID and description for main process task tracking
      const taskId = `download-${Date.now()}`;
      taskIdRef.current = taskId;
      const title = videoInfo?.title || t('download:task.downloading');
      const taskDescription = `${t('download:task.downloading')}: ${title}`;

      try {
        // Pass taskId and taskDescription to main process for reliable task tracking
        const path = await startDownload({
          url: currentUrl,
          formatId,
          outputDir,
          taskId,
          taskDescription,
        });

        // Task is unregistered in main process, just clear local ref
        taskIdRef.current = null;

        setOutputPath(path);
        setStatus('completed');
        return path;
      } catch (err: any) {
        // Task is unregistered in main process on error, just clear local ref
        taskIdRef.current = null;

        const errInfo = err.errorInfo as DownloadError | undefined;
        const errorMessage = errInfo?.message || err.message;
        logger.error(`[Download] Download failed: ${errorMessage}`, { err, errInfo });
        setError(errorMessage);
        setErrorInfo(errInfo || null);
        setStatus('error');
        return undefined;
      }
    },
    [currentUrl, outputDir, videoInfo, t, resetProgress]
  );

  const downloadThumbnail = useCallback(async (): Promise<string | undefined> => {
    if (!videoInfo || !outputDir) return;

    try {
      const path = await downloadThumbnailService({
        thumbnailUrl: videoInfo.thumbnail,
        outputDir,
        videoTitle: videoInfo.title,
        videoId: videoInfo.id,
      });
      setThumbnailPath(path);
      addToast(t('download:thumbnailSuccess'), 'success');
      return path;
    } catch (err: any) {
      logger.error('[Download] Thumbnail download failed', { err });
      // Don't set error state for thumbnail failures - it's not critical
      // But show a toast to notify the user
      addToast(t('download:errors.thumbnailFailed'), 'warning');
      return undefined;
    }
  }, [videoInfo, outputDir, t, addToast]);

  const cancel = useCallback(async () => {
    // Pass taskId to main process for reliable task unregistration
    const currentTaskId = taskIdRef.current;
    taskIdRef.current = null;

    await cancelDownload(currentTaskId || undefined);
    setStatus('idle');
    setRawProgress(null);
    resetProgress();
  }, [resetProgress]);

  const selectDir = useCallback(async () => {
    const dir = await selectOutputDir();
    if (dir) setOutputDir(dir);
  }, []);

  const reset = useCallback(() => {
    setStatus('idle');
    setVideoInfo(null);
    setRawProgress(null);
    resetProgress();
    setError(null);
    setErrorInfo(null);
    setOutputPath(null);
    setThumbnailPath(null);
    setCurrentUrl('');
    setLastFormatId('');
  }, [resetProgress]);

  // Retry function - only retries if error is retryable
  const retry = useCallback(async () => {
    if (!currentUrl) return;

    // If we have video info, retry download; otherwise retry parse
    if (videoInfo && lastFormatId) {
      await download(lastFormatId);
    } else {
      await parse(currentUrl);
    }
  }, [currentUrl, videoInfo, lastFormatId, download, parse]);

  return {
    status,
    videoInfo,
    progress,
    outputDir,
    error,
    errorInfo,
    outputPath,
    thumbnailPath,
    lastUrl: currentUrl,
    parse,
    download,
    downloadThumbnail,
    cancel,
    selectDir,
    reset,
    retry,
  };
}
