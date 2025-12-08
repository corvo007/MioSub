/**
 * Download Service - Renderer Process
 */
import type { VideoInfo, DownloadProgress, DownloadOptions } from './types';

// Re-export types
export type { VideoInfo, DownloadProgress, DownloadOptions };

export async function parseVideoUrl(url: string): Promise<VideoInfo> {
  if (!window.electronAPI?.download) {
    throw new Error('Download API not available');
  }
  const result = await window.electronAPI.download.parse(url);
  if (!result.success || !result.videoInfo) {
    const error: any = new Error(result.error || 'Failed to parse URL');
    error.errorInfo = result.errorInfo;
    throw error;
  }
  return result.videoInfo as VideoInfo;
}

export async function startDownload(options: DownloadOptions): Promise<string> {
  if (!window.electronAPI?.download) {
    throw new Error('Download API not available');
  }
  const result = await window.electronAPI.download.start(options);
  if (!result.success || !result.outputPath) {
    const error: any = new Error(result.error || 'Download failed');
    error.errorInfo = result.errorInfo;
    throw error;
  }
  return result.outputPath;
}

export async function cancelDownload(): Promise<void> {
  if (!window.electronAPI?.download) {
    throw new Error('Download API not available');
  }
  await window.electronAPI.download.cancel();
}

export async function selectOutputDir(): Promise<string | null> {
  if (!window.electronAPI?.download) {
    throw new Error('Download API not available');
  }
  const result = await window.electronAPI.download.selectDir();
  if (result.canceled) return null;
  if (!result.success) throw new Error('Failed to select directory');
  return result.path || null;
}

export async function getDefaultOutputDir(): Promise<string> {
  if (!window.electronAPI?.download) {
    throw new Error('Download API not available');
  }
  const result = await window.electronAPI.download.getDefaultDir();
  return result.path;
}

export function onDownloadProgress(callback: (progress: DownloadProgress) => void): () => void {
  if (!window.electronAPI?.download) {
    return () => {};
  }
  return window.electronAPI.download.onProgress(callback);
}
