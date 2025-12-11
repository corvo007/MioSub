/**
 * useDownload Hook - Video Download State Management
 */
import { useState, useEffect, useCallback } from 'react';
import type {
  VideoInfo,
  DownloadProgress,
  DownloadStatus,
  DownloadError,
} from '../services/download/types';
import {
  parseVideoUrl,
  startDownload,
  cancelDownload,
  selectOutputDir,
  getDefaultOutputDir,
  onDownloadProgress,
  downloadThumbnail as downloadThumbnailService,
} from '../services/download';

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
  const [status, setStatus] = useState<DownloadStatus>('idle');
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [outputDir, setOutputDir] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [errorInfo, setErrorInfo] = useState<DownloadError | null>(null);
  const [outputPath, setOutputPath] = useState<string | null>(null);
  const [thumbnailPath, setThumbnailPath] = useState<string | null>(null);
  const [currentUrl, setCurrentUrl] = useState<string>('');
  const [lastFormatId, setLastFormatId] = useState<string>('');

  // Initialize default output directory
  useEffect(() => {
    // Check if download API is available before calling
    if (window.electronAPI?.download) {
      getDefaultOutputDir().then(setOutputDir).catch(console.error);
    }
  }, []);

  // Subscribe to progress updates
  useEffect(() => {
    // Check if download API is available before subscribing
    if (!window.electronAPI?.download) {
      return () => {};
    }
    const unsubscribe = onDownloadProgress(setProgress);
    return unsubscribe;
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
      setError(errInfo?.message || err.message);
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
      setProgress(null);
      setLastFormatId(formatId);
      try {
        const path = await startDownload({ url: currentUrl, formatId, outputDir });
        setOutputPath(path);
        setStatus('completed');
        return path;
      } catch (err: any) {
        const errInfo = err.errorInfo as DownloadError | undefined;
        setError(errInfo?.message || err.message);
        setErrorInfo(errInfo || null);
        setStatus('error');
        return undefined;
      }
    },
    [currentUrl, outputDir]
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
      return path;
    } catch (err: any) {
      console.error('Thumbnail download failed:', err);
      // Don't set error state for thumbnail failures - it's not critical
      return undefined;
    }
  }, [videoInfo, outputDir]);

  const cancel = useCallback(async () => {
    await cancelDownload();
    setStatus('idle');
    setProgress(null);
  }, []);

  const selectDir = useCallback(async () => {
    const dir = await selectOutputDir();
    if (dir) setOutputDir(dir);
  }, []);

  const reset = useCallback(() => {
    setStatus('idle');
    setVideoInfo(null);
    setProgress(null);
    setError(null);
    setErrorInfo(null);
    setOutputPath(null);
    setThumbnailPath(null);
    setCurrentUrl('');
    setLastFormatId('');
  }, []);

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
