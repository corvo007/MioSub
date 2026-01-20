import { type RefObject } from 'react';
import type React from 'react';
import { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { type SubtitleItem } from '@/types/subtitle';
import { GenerationStatus } from '@/types/api';
import { type SpeakerUIProfile } from '@/types/speaker';
import { logger } from '@/services/utils/logger';
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback';
import { type SnapshotsValuesProps } from '@/types/workspace';
import { parseAssStyles } from '@/services/subtitle/parser';
import { sanitizeSpeakerForStyle } from '@/services/subtitle/utils';

interface UseFileOperationsProps {
  // State reading
  file: File | null;
  subtitles: SubtitleItem[];
  status: GenerationStatus;

  // State setters
  setFile: (file: File | null) => void;
  setSubtitles: (subtitles: SubtitleItem[]) => void;
  setStatus: (status: GenerationStatus) => void;
  setError: (error: string | null) => void;
  setDuration: (duration: number) => void;
  setSpeakerProfiles: (profiles: SpeakerUIProfile[]) => void;
  setBatchComments: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  setSelectedBatches: (batches: Set<number>) => void;

  // Refs
  audioCacheRef: RefObject<{ file: File; buffer: AudioBuffer } | null>;

  // External dependencies
  showConfirm: (
    title: string,
    message: string,
    onConfirm: () => void,
    type?: 'info' | 'warning' | 'danger'
  ) => void;
  snapshotsValues: Pick<SnapshotsValuesProps, 'setSnapshots' | 'createSnapshot'>;
  parseSubtitle: (content: string, type: 'srt' | 'ass') => Promise<SubtitleItem[]>;
}

interface UseFileOperationsReturn {
  // Handlers
  handleFileChange: (
    e: React.ChangeEvent<HTMLInputElement>,
    activeTab: 'new' | 'import'
  ) => Promise<void>;
  handleFileSelectNative: (
    fileStub: File & { path?: string; _needsRead?: boolean }
  ) => Promise<void>;
  handleSubtitleImport: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleSubtitleImportNative: () => Promise<void>;

  // State
  isLoadingFile: boolean;
  setIsLoadingFile: (loading: boolean) => void;
  isLoadingSubtitle: boolean;
  subtitleFileName: string | null;
  setSubtitleFileName: (name: string | null) => void;
}

/**
 * Get the duration of a media file.
 * Uses Electron FFmpeg API first, falls back to DOM.
 */
async function getFileDuration(f: File): Promise<number> {
  // Electron Optimization: Use FFmpeg via Main Process
  if (window.electronAPI && window.electronAPI.getAudioInfo) {
    // First check if we have a path property attached (our stub File objects)
    // Then try webUtils.getPathForFile for real File objects
    const path = (f as File & { path?: string }).path || window.electronAPI.getFilePath(f);
    if (path) {
      try {
        const result = await window.electronAPI.getAudioInfo(path);
        if (result.success && result.info) {
          return result.info.duration;
        }
      } catch (e) {
        logger.warn('Failed to get duration via Electron API, falling back to DOM', e);
      }
    }
  }

  // Web / Fallback: Use DOM
  return new Promise((resolve) => {
    const element = f.type.startsWith('audio') ? new Audio() : document.createElement('video');
    element.preload = 'metadata';
    const url = URL.createObjectURL(f);
    element.src = url;
    element.onloadedmetadata = () => {
      resolve(element.duration);
      URL.revokeObjectURL(url);
    };
    element.onerror = () => {
      logger.warn('Failed to get file duration via DOM, using default value 0');
      resolve(0);
      URL.revokeObjectURL(url);
    };
  });
}

/**
 * Hook for handling file and subtitle import operations.
 */
export function useFileOperations({
  file,
  subtitles,
  status,
  setFile,
  setSubtitles,
  setStatus,
  setError,
  setDuration,
  setSpeakerProfiles,
  setBatchComments,
  setSelectedBatches: _setSelectedBatches,
  audioCacheRef,
  showConfirm,
  snapshotsValues,
  parseSubtitle,
}: UseFileOperationsProps): UseFileOperationsReturn {
  const { t } = useTranslation(['workspace', 'services']);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [isLoadingSubtitle, setIsLoadingSubtitle] = useState(false);
  const [subtitleFileName, setSubtitleFileName] = useState<string | null>(null);

  // Ref to track the latest operation ID to prevent race conditions
  const operationIdRef = useRef(0);

  // Common file processing logic - confirmation is handled by callers
  const processFileInternal = useCallback(
    async (selectedFile: File) => {
      const currentOpId = ++operationIdRef.current;
      setIsLoadingFile(true);
      try {
        logger.info(
          `File selected: ${selectedFile.name} (Size: ${selectedFile.size}, Type: ${selectedFile.type})`
        );

        // Async operation: get duration
        let d = 0;
        try {
          d = await getFileDuration(selectedFile);
        } catch (e) {
          logger.warn('Failed to get file duration, defaulting to 0', e);
        }

        // Check if this operation is still relevant
        if (currentOpId !== operationIdRef.current) {
          logger.info('Ignoring stale file load result', { selectedFile: selectedFile.name });
          return;
        }

        setFile(selectedFile);
        audioCacheRef.current = null;
        setError(null);
        setDuration(d);

        // Analytics: Video Loaded
        if (window.electronAPI?.analytics) {
          void window.electronAPI.analytics.track(
            'editor_video_loaded',
            {
              type: selectedFile.type,
              size: selectedFile.size,
              duration_sec: d,
            },
            'interaction'
          );
        }
      } finally {
        if (currentOpId === operationIdRef.current) {
          setIsLoadingFile(false);
        }
      }
    },
    [setFile, setError, setDuration, audioCacheRef]
  );

  // Handlers - Web file input (non-native)
  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>, _activeTab: 'new' | 'import') => {
      if (e.target.files && e.target.files[0]) {
        const selectedFile = e.target.files[0];

        // Check if confirmation is needed BEFORE processing
        if (file && subtitles.length > 0 && status === GenerationStatus.COMPLETED) {
          showConfirm(
            t('workspace:hooks.fileOperations.confirm.replaceFile.title'),
            t('workspace:hooks.fileOperations.confirm.replaceFile.message'),
            async () => {
              setSubtitles([]);
              setStatus(GenerationStatus.IDLE);
              setBatchComments({});
              await processFileInternal(selectedFile);
            },
            'warning'
          );
        } else {
          await processFileInternal(selectedFile);
        }
      }
    },
    [
      file,
      subtitles.length,
      status,
      showConfirm,
      processFileInternal,
      setSubtitles,
      setStatus,
      setBatchComments,
      t,
    ]
  );

  const handleFileSelectNative = useCallback(
    async (fileStub: File & { path?: string; _needsRead?: boolean }) => {
      // Helper to read the full file and process it
      const readAndProcessFile = async () => {
        const filePath = fileStub.path || window.electronAPI?.getFilePath?.(fileStub);
        if (!filePath) {
          // Already a full File object, process directly
          await processFileInternal(fileStub);
          return;
        }

        const currentOpId = ++operationIdRef.current;
        setIsLoadingFile(true);
        // Give React time to render the loading indicator
        await new Promise((resolve) => setTimeout(resolve, 50));

        if (currentOpId !== operationIdRef.current) return;

        try {
          // In Electron, we don't need to read the entire file into memory!
          // FFmpeg and other operations use the file path directly.
          // Just create a File-like object with the path and size attached.
          const fileObj = new File([], fileStub.name, {
            type: fileStub.type || 'application/octet-stream',
          });

          // Attach path and size to file for Electron/FFmpeg usage
          Object.defineProperty(fileObj, 'path', {
            value: filePath,
            writable: false,
            enumerable: false,
            configurable: false,
          });
          // Override size since empty File always has size 0
          Object.defineProperty(fileObj, 'size', {
            value: fileStub.size || 0,
            writable: false,
            enumerable: true,
            configurable: false,
          });

          if (currentOpId !== operationIdRef.current) return;

          // processFileInternal will check opId again, but we can call it directly
          await processFileInternal(fileObj);
        } catch (err) {
          if (currentOpId !== operationIdRef.current) return;

          logger.error('Failed to process file', err);
          setError(t('workspace:hooks.fileOperations.errors.processFailed'));
          setIsLoadingFile(false);
        }
      };

      // Check if confirmation is needed BEFORE reading file
      if (file && subtitles.length > 0 && status === GenerationStatus.COMPLETED) {
        showConfirm(
          t('workspace:hooks.fileOperations.confirm.replaceFile.title'),
          t('workspace:hooks.fileOperations.confirm.replaceFile.message'),
          async () => {
            setSubtitles([]);
            setStatus(GenerationStatus.IDLE);
            setBatchComments({});
            await readAndProcessFile();
          },
          'warning'
        );
      } else {
        await readAndProcessFile();
      }
    },
    [
      file,
      subtitles.length,
      status,
      showConfirm,
      processFileInternal,
      setSubtitles,
      setStatus,
      setBatchComments,
      setError,
      t,
    ]
  );

  const handleSubtitleImport = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
        const subFile = e.target.files[0];
        logger.info('Subtitle file imported', { name: subFile.name });

        const currentOpId = ++operationIdRef.current;
        setIsLoadingSubtitle(true);
        try {
          // Allow UI to update before heavy parsing
          await new Promise((resolve) => setTimeout(resolve, 50));
          if (currentOpId !== operationIdRef.current) return;

          const content = await subFile.text();

          const fileType = subFile.name.endsWith('.ass') ? 'ass' : 'srt';

          const parsed = await parseSubtitle(content, fileType);

          setSubtitles(parsed);
          setSubtitleFileName(subFile.name);

          // Extract and set speaker profiles with colors from ASS styles
          const uniqueSpeakers = Array.from(
            new Set(parsed.map((s) => s.speaker).filter(Boolean))
          ) as string[];
          const speakerColors = fileType === 'ass' ? parseAssStyles(content) : {};
          const profiles: SpeakerUIProfile[] = uniqueSpeakers.map((name) => ({
            id: name,
            name: name,
            color: speakerColors[sanitizeSpeakerForStyle(name)], // Lookup with sanitized name
          }));
          // Actually, import replaces subtitles, so we should replace profiles too.
          setSpeakerProfiles(profiles);

          setStatus(GenerationStatus.COMPLETED);

          // Analytics: Subtitle Loaded
          if (window.electronAPI?.analytics) {
            void window.electronAPI.analytics.track(
              'editor_subtitle_loaded',
              {
                format: fileType,
                count: parsed.length,
              },
              'interaction'
            );
          }
          setBatchComments({});
          const fileId = window.electronAPI?.getFilePath?.(subFile) || subFile.name;
          snapshotsValues.createSnapshot(
            t('services:snapshots.initialImport'),
            parsed,
            {},
            fileId,
            subFile.name,
            profiles
          );
        } catch (error: unknown) {
          if (currentOpId !== operationIdRef.current) return;

          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error('Failed to parse subtitle', error);
          setError(t('workspace:hooks.fileOperations.errors.parseFailed', { error: errorMessage }));
          setStatus(GenerationStatus.ERROR);
        } finally {
          if (currentOpId === operationIdRef.current) {
            setIsLoadingSubtitle(false);
          }
        }
      }
    },
    [
      snapshotsValues,
      parseSubtitle,
      setSubtitles,
      setStatus,
      setError,
      setSpeakerProfiles,
      setBatchComments,
      t,
    ]
  );

  // Native dialog handler for subtitle import (Electron only)
  const handleSubtitleImportNative = useCallback(async () => {
    if (!window.electronAPI?.selectSubtitleFile) return;

    // Declare opId outside try/catch so it's available in catch block
    const currentOpId = ++operationIdRef.current;

    try {
      const result = await window.electronAPI.selectSubtitleFile();
      if (currentOpId !== operationIdRef.current) return;

      if (!result.success || !result.content || !result.fileName) return;

      // Set loading immediately after file is selected (before parsing)
      setIsLoadingSubtitle(true);
      logger.info('Subtitle file imported (native)', { name: result.fileName });
      await new Promise((resolve) => setTimeout(resolve, 50));
      if (currentOpId !== operationIdRef.current) return;

      const fileType = result.fileName.endsWith('.ass') ? 'ass' : 'srt';
      const parsed = await parseSubtitle(result.content, fileType);
      if (currentOpId !== operationIdRef.current) return;

      setSubtitles(parsed);
      setSubtitleFileName(result.fileName);

      // Extract and set speaker profiles with colors from ASS styles
      const uniqueSpeakers = Array.from(
        new Set(parsed.map((s) => s.speaker).filter(Boolean))
      ) as string[];
      const speakerColors = fileType === 'ass' ? parseAssStyles(result.content) : {};
      const profiles: SpeakerUIProfile[] = uniqueSpeakers.map((name) => ({
        id: name,
        name: name,
        color: speakerColors[sanitizeSpeakerForStyle(name)], // Lookup with sanitized name
      }));
      setSpeakerProfiles(profiles);

      setStatus(GenerationStatus.COMPLETED);

      // Analytics: Subtitle Loaded (Native)
      if (window.electronAPI?.analytics) {
        void window.electronAPI.analytics.track(
          'editor_subtitle_loaded',
          {
            format: fileType,
            count: parsed.length,
          },
          'interaction'
        );
      }
      setBatchComments({});
      const fileId = result.filePath || result.fileName;
      snapshotsValues.createSnapshot(
        t('services:snapshots.initialImport'),
        parsed,
        {},
        fileId,
        result.fileName,
        profiles
      );
    } catch (error: unknown) {
      if (currentOpId !== operationIdRef.current) return;
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('Failed to parse subtitle (native)', error);
      setError(t('workspace:hooks.fileOperations.errors.parseFailed', { error: errorMessage }));
      setStatus(GenerationStatus.ERROR);
    } finally {
      if (currentOpId === operationIdRef.current) {
        setIsLoadingSubtitle(false);
      }
    }
  }, [
    snapshotsValues,
    parseSubtitle,
    setSubtitles,
    setStatus,
    setError,
    setSpeakerProfiles,
    setBatchComments,
    t,
  ]);

  // 防抖版本 - 防止快速重复点击文件选择按钮
  const debouncedHandleFileSelectNative = useDebouncedCallback(handleFileSelectNative);
  const debouncedHandleSubtitleImportNative = useDebouncedCallback(handleSubtitleImportNative);

  return {
    handleFileChange,
    handleFileSelectNative: debouncedHandleFileSelectNative,
    handleSubtitleImport,
    handleSubtitleImportNative: debouncedHandleSubtitleImportNative,
    isLoadingFile,
    setIsLoadingFile,
    isLoadingSubtitle,
    subtitleFileName,
    setSubtitleFileName,
  };
}
