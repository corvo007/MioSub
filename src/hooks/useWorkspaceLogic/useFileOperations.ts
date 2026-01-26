import type React from 'react';
import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { type SubtitleItem } from '@/types/subtitle';
import { GenerationStatus } from '@/types/api';

import { logger } from '@/services/utils/logger';
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback';
import { type SnapshotsValuesProps } from '@/types/workspace';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';
import { processSubtitleImport } from '@/hooks/useWorkspaceLogic/processSubtitleImport';

interface UseFileOperationsProps {
  // External dependencies still passed as props/context
  showConfirm: (
    title: string,
    message: string,
    onConfirm: () => void,
    type?: 'info' | 'warning' | 'danger'
  ) => void;
  snapshotsValues: Pick<SnapshotsValuesProps, 'setSnapshots' | 'createSnapshot'>;
  parseSubtitle: (content: string, type: 'srt' | 'ass') => Promise<SubtitleItem[]>;
  audioCacheRef: React.RefObject<{ file: File; buffer: AudioBuffer } | null>;
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
 * Now reads/writes directly to useWorkspaceStore.
 */
export function useFileOperations({
  audioCacheRef,
  showConfirm,
  snapshotsValues,
  parseSubtitle,
}: UseFileOperationsProps): UseFileOperationsReturn {
  const { t } = useTranslation(['workspace', 'services']);

  // Ref to track the latest operation ID to prevent race conditions
  const operationIdRef = useRef(0);

  // Common file processing logic - confirmation is handled by callers
  // forceReset: when true (user confirmed replacement), clears all workspace state including subtitles
  const processFileInternal = useCallback(
    async (selectedFile: File, forceReset = false) => {
      const currentOpId = ++operationIdRef.current;

      const {
        setIsLoadingFile,
        setFile,
        setError,
        setDuration,
        setStatus,
        setSubtitles,
        setBatchComments,
        setSelectedBatches,
      } = useWorkspaceStore.getState();

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

        // Reset workspace state related to new file
        // forceReset: user confirmed replacement - clear everything
        // !forceReset: preserve existing subtitles (user loaded video after importing subtitles)
        const currentState = useWorkspaceStore.getState();
        if (forceReset || currentState.subtitles.length === 0) {
          setSubtitles([]);
          setStatus(GenerationStatus.IDLE);
          setBatchComments({});
          setSelectedBatches(new Set());
        }

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
    [audioCacheRef]
  );

  // Handlers - Web file input (non-native)
  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>, _activeTab: 'new' | 'import') => {
      if (e.target.files && e.target.files[0]) {
        const selectedFile = e.target.files[0];
        const state = useWorkspaceStore.getState();

        // Check if confirmation is needed BEFORE processing
        if (
          state.file &&
          state.subtitles.length > 0 &&
          state.status === GenerationStatus.COMPLETED
        ) {
          showConfirm(
            t('workspace:hooks.fileOperations.confirm.replaceFile.title'),
            t('workspace:hooks.fileOperations.confirm.replaceFile.message'),
            async () => {
              // User confirmed replacement - force reset all workspace state
              await processFileInternal(selectedFile, true);
            },
            'warning'
          );
        } else {
          await processFileInternal(selectedFile);
        }
      }
    },
    [showConfirm, processFileInternal, t]
  );

  const handleFileSelectNative = useCallback(
    async (fileStub: File & { path?: string; _needsRead?: boolean }) => {
      // Helper to read the full file and process it
      // forceReset: when true (user confirmed), clears subtitles
      const readAndProcessFile = async (forceReset = false) => {
        const filePath = fileStub.path || window.electronAPI?.getFilePath?.(fileStub);
        if (!filePath) {
          // Already a full File object, process directly
          await processFileInternal(fileStub, forceReset);
          return;
        }

        const currentOpId = ++operationIdRef.current;
        useWorkspaceStore.getState().setIsLoadingFile(true);
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
          await processFileInternal(fileObj, forceReset);
        } catch (err) {
          if (currentOpId !== operationIdRef.current) return;

          logger.error('Failed to process file', err);
          const { setError, setIsLoadingFile } = useWorkspaceStore.getState();
          setError(t('workspace:hooks.fileOperations.errors.processFailed'));
          setIsLoadingFile(false);
        }
      };

      const state = useWorkspaceStore.getState();

      // Check if confirmation is needed BEFORE reading file
      if (state.file && state.subtitles.length > 0 && state.status === GenerationStatus.COMPLETED) {
        showConfirm(
          t('workspace:hooks.fileOperations.confirm.replaceFile.title'),
          t('workspace:hooks.fileOperations.confirm.replaceFile.message'),
          async () => {
            // User confirmed replacement - force reset all workspace state
            await readAndProcessFile(true);
          },
          'warning'
        );
      } else {
        await readAndProcessFile();
      }
    },
    [showConfirm, processFileInternal, t]
  );

  const handleSubtitleImport = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
        const subFile = e.target.files[0];
        logger.info('Subtitle file imported', { name: subFile.name });

        const currentOpId = ++operationIdRef.current;
        const { setIsLoadingSubtitle, setStatus, setError } = useWorkspaceStore.getState();

        setIsLoadingSubtitle(true);
        try {
          // Allow UI to update before heavy parsing
          await new Promise((resolve) => setTimeout(resolve, 50));
          if (currentOpId !== operationIdRef.current) return;

          const content = await subFile.text();

          const fileType = subFile.name.endsWith('.ass') ? 'ass' : 'srt';

          const parsed = await parseSubtitle(content, fileType);

          // For web import, use file name as a simple ID
          const fileId = subFile.name;

          processSubtitleImport(parsed, subFile.name, fileType, fileId, content, snapshotsValues);
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
    [snapshotsValues, parseSubtitle, t]
  );

  // Native dialog handler for subtitle import (Electron only)
  const handleSubtitleImportNative = useCallback(async () => {
    if (!window.electronAPI?.selectSubtitleFile) return;

    // Declare opId outside try/catch so it's available in catch block
    const currentOpId = ++operationIdRef.current;
    const { setIsLoadingSubtitle, setStatus, setError } = useWorkspaceStore.getState();

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

      // Use full path as ID for native imports
      const fileId = result.filePath || result.fileName;

      processSubtitleImport(
        parsed,
        result.fileName,
        fileType,
        fileId,
        result.content,
        snapshotsValues
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
  }, [snapshotsValues, parseSubtitle, t]);

  // 防抖版本 - 防止快速重复点击文件选择按钮
  const debouncedHandleFileSelectNative = useDebouncedCallback(handleFileSelectNative);
  const debouncedHandleSubtitleImportNative = useDebouncedCallback(handleSubtitleImportNative);

  return {
    handleFileChange,
    handleFileSelectNative: debouncedHandleFileSelectNative,
    handleSubtitleImport,
    handleSubtitleImportNative: debouncedHandleSubtitleImportNative,
  };
}
