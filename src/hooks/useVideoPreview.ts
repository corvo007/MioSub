import { useState, useRef, useCallback, useEffect } from 'react';
import { logger } from '@/services/utils/logger';
import type { VideoPlayerPreviewRef } from '@/components/editor/VideoPlayerPreview';

const SUPPORTED_FORMATS = ['mp4', 'webm', 'm4v', 'mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac'];

export interface UseVideoPreviewReturn {
  videoSrc: string | null;
  currentTime: number;
  isTranscoding: boolean;
  transcodeProgress: number;
  transcodedDuration: number | undefined;
  fullVideoDuration: number | undefined; // Full duration from backend
  isCollapsed: boolean;
  playerRef: React.RefObject<VideoPlayerPreviewRef>;
  prepareVideo: (file: File | string) => Promise<void>;
  seekTo: (seconds: number) => void;
  updateTime: (seconds: number) => void;
  setIsCollapsed: (collapsed: boolean) => void;
  clearVideo: () => void;
}

/**
 * Hook for managing video preview state and transcoding
 */
export function useVideoPreview(): UseVideoPreviewReturn {
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isTranscoding, setIsTranscoding] = useState(false);
  const [transcodeProgress, setTranscodeProgress] = useState(0);
  const [transcodedDuration, setTranscodedDuration] = useState<number | undefined>(undefined);
  const [fullVideoDuration, setFullVideoDuration] = useState<number | undefined>(undefined);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const playerRef = useRef<VideoPlayerPreviewRef>(null);
  const objectUrlRef = useRef<string | null>(null);
  const progressListenerCleanupRef = useRef<(() => void) | null>(null);
  const currentTranscodingFileRef = useRef<string | null>(null);
  const taskIdRef = useRef<string | null>(null);

  // Clean up old Object URL and cancel active transcoding
  const cleanupUrl = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    if (progressListenerCleanupRef.current) {
      progressListenerCleanupRef.current();
      progressListenerCleanupRef.current = null;
    }
    // Unregister task on cleanup
    if (taskIdRef.current) {
      window.electronAPI?.task?.unregister(taskIdRef.current).catch(console.error);
      taskIdRef.current = null;
    }
    // Cancel any active transcoding task in backend
    if (currentTranscodingFileRef.current) {
      window.electronAPI
        ?.cancelPreviewTranscode?.(currentTranscodingFileRef.current)
        .catch((err) => {
          logger.error('[VideoPreview] Failed to cancel transcoding', err);
        });
      currentTranscodingFileRef.current = null;
    }
  }, []);

  // Log video src changes to avoid side-effects during render
  useEffect(() => {
    if (videoSrc) {
      logger.info(`[VideoPreview] Setting video src: ${videoSrc}`);
    }
  }, [videoSrc]);

  /**
   * Prepare video for playback - handles format detection and transcoding
   */
  const prepareVideo = useCallback(
    async (fileOrPath: File | string) => {
      // Clean up any existing listeners and URLs first
      cleanupUrl();
      setCurrentTime(0);
      setTranscodedDuration(undefined);

      let filePath: string;

      if (typeof fileOrPath === 'string') {
        filePath = fileOrPath;
      } else {
        filePath = (fileOrPath as File & { path?: string }).path || fileOrPath.name;
      }

      const ext = filePath.split('.').pop()?.toLowerCase() || '';

      const setLocalVideoSrc = (path: string, isStatic = false) => {
        // Only set if different to avoid potential loops
        const encodedPath = encodeURIComponent(path.replace(/\\/g, '/'));
        const query = isStatic ? '?static=true' : '';
        const videoUrl = `local-video://file/${encodedPath}${query}`;
        setVideoSrc((prev) => {
          if (prev === videoUrl) return prev;
          return videoUrl;
        });
      };

      if (SUPPORTED_FORMATS.includes(ext)) {
        // Directly supported format - use local-video:// protocol
        setLocalVideoSrc(filePath, true); // Use static mode for direct files
        setIsTranscoding(false);
        setTranscodeProgress(100);
      } else {
        // Needs transcoding
        setIsTranscoding(true);
        setTranscodeProgress(0);

        // Register task for close confirmation
        const taskId = `transcode-${Date.now()}`;
        taskIdRef.current = taskId;
        window.electronAPI?.task
          ?.register(taskId, 'transcode', 'Transcoding video for preview')
          .catch(console.error);

        // Track listeners registered in this call for cleanup
        const cleanupFns: Array<() => void> = [];

        try {
          if (!window.electronAPI?.transcodeForPreview) {
            logger.error('[VideoPreview] Electron API not available for transcoding');
            setIsTranscoding(false);
            return;
          }

          // Set up progress listener
          if (window.electronAPI.onTranscodeProgress) {
            const cleanup = window.electronAPI.onTranscodeProgress(
              (data: { percent: number; transcodedDuration?: number }) => {
                setTranscodeProgress(data.percent);
                if (data.transcodedDuration !== undefined) {
                  setTranscodedDuration(data.transcodedDuration);
                }
              }
            );
            cleanupFns.push(cleanup);
          }

          // Set up start listener for progressive playback
          if (window.electronAPI.onTranscodeStart) {
            const cleanupStart = window.electronAPI.onTranscodeStart(
              (data: { outputPath: string; duration?: number }) => {
                logger.info(
                  `[VideoPreview] Transcoding started, playing progressive: ${data.outputPath}`
                );
                setLocalVideoSrc(data.outputPath);
                // Set duration immediately so progress bar shows correct total length
                if (data.duration && data.duration > 0) {
                  setFullVideoDuration(data.duration);
                }
              }
            );
            cleanupFns.push(cleanupStart);
          }

          // Store cleanup functions for later use
          progressListenerCleanupRef.current = () => {
            cleanupFns.forEach((fn) => fn());
          };

          // Start transcoding
          currentTranscodingFileRef.current = filePath;
          const result = await window.electronAPI.transcodeForPreview({
            filePath: filePath,
          });
          currentTranscodingFileRef.current = null; // Finished successfully

          // Unregister task on completion
          if (taskIdRef.current) {
            window.electronAPI?.task?.unregister(taskIdRef.current).catch(console.error);
            taskIdRef.current = null;
          }

          // Fallback: if start event didn't fire or we missed it, set src here
          // Also set the full video duration from the result
          if (result?.outputPath) {
            // Preserve current playback position before switching URLs
            const savedTime = playerRef.current?.getCurrentTime() || 0;
            setLocalVideoSrc(result.outputPath, true);
            // Schedule seek to preserved position after video loads
            if (savedTime > 0) {
              setTimeout(() => playerRef.current?.seekTo(savedTime), 100);
            }
          }
          if (result?.duration) {
            setFullVideoDuration(result.duration);
          }
          setTranscodedDuration(undefined);
        } catch (error) {
          // Clean up listeners on error
          cleanupFns.forEach((fn) => fn());
          progressListenerCleanupRef.current = null;
          // Unregister task on error
          if (taskIdRef.current) {
            window.electronAPI?.task?.unregister(taskIdRef.current).catch(console.error);
            taskIdRef.current = null;
          }
          logger.error('[VideoPreview] Transcoding failed', error);
          throw error;
        } finally {
          setIsTranscoding(false);
        }
      }
    },
    [cleanupUrl] // Removed videoSrc from dependency to prevent infinite loop
  );

  const seekTo = useCallback((seconds: number) => {
    playerRef.current?.seekTo(seconds);
  }, []);

  const updateTime = useCallback((seconds: number) => {
    setCurrentTime(seconds);
  }, []);

  const clearVideo = useCallback(() => {
    cleanupUrl();
    setVideoSrc(null);
    setCurrentTime(0);
    setIsTranscoding(false);
    setTranscodeProgress(0);
    setTranscodedDuration(undefined);
  }, [cleanupUrl]);

  // Cleanup on unmount
  useEffect(() => {
    return () => cleanupUrl();
  }, [cleanupUrl]);

  return {
    videoSrc,
    currentTime,
    isTranscoding,
    transcodeProgress,
    transcodedDuration,
    fullVideoDuration,
    isCollapsed,
    playerRef,
    prepareVideo,
    seekTo,
    updateTime,
    setIsCollapsed,
    clearVideo,
  };
}
