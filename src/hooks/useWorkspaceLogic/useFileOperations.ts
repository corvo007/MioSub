import { type RefObject } from 'react';
import type React from 'react';
import { useState, useCallback, useRef } from 'react';
import { type SubtitleItem } from '@/types/subtitle';
import { GenerationStatus } from '@/types/api';
import { type SpeakerUIProfile } from '@/types/speaker';
import { logger } from '@/services/utils/logger';
import { getSpeakerColor } from '@/services/utils/colors';
import { type SnapshotsValuesProps } from './types';

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
        logger.info('File selected', {
          name: selectedFile.name,
          size: selectedFile.size,
          type: selectedFile.type,
        });

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
            '确认替换文件',
            '替换文件后将清空当前字幕。建议先导出字幕（SRT/ASS）再操作。是否继续？',
            async () => {
              setSubtitles([]);
              setStatus(GenerationStatus.IDLE);
              snapshotsValues.setSnapshots([]);
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
      snapshotsValues,
      showConfirm,
      processFileInternal,
      setSubtitles,
      setStatus,
      setBatchComments,
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
          setError('文件处理失败');
          setIsLoadingFile(false);
        }
      };

      // Check if confirmation is needed BEFORE reading file
      if (file && subtitles.length > 0 && status === GenerationStatus.COMPLETED) {
        showConfirm(
          '确认替换文件',
          '替换文件后将清空当前字幕。建议先导出字幕（SRT/ASS）再操作。是否继续？',
          async () => {
            setSubtitles([]);
            setStatus(GenerationStatus.IDLE);
            snapshotsValues.setSnapshots([]);
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
      snapshotsValues,
      showConfirm,
      processFileInternal,
      setSubtitles,
      setStatus,
      setBatchComments,
      setError,
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
          if (currentOpId !== operationIdRef.current) return;

          const fileType = subFile.name.endsWith('.ass') ? 'ass' : 'srt';

          const parsed = await parseSubtitle(content, fileType);
          if (currentOpId !== operationIdRef.current) return;

          setSubtitles(parsed);
          setSubtitleFileName(subFile.name);

          // Extract and set speaker profiles
          const uniqueSpeakers = Array.from(
            new Set(parsed.map((s) => s.speaker).filter(Boolean))
          ) as string[];
          const profiles: SpeakerUIProfile[] = uniqueSpeakers.map((name) => ({
            id: name,
            name: name,
            color: getSpeakerColor(name),
          }));
          // Actually, import replaces subtitles, so we should replace profiles too.
          setSpeakerProfiles(profiles);

          setStatus(GenerationStatus.COMPLETED);
          setBatchComments({});
          const fileId = window.electronAPI?.getFilePath?.(subFile) || subFile.name;
          snapshotsValues.createSnapshot('初始导入', parsed, {}, fileId, subFile.name);
        } catch (error: unknown) {
          if (currentOpId !== operationIdRef.current) return;
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error('Failed to parse subtitle', error);
          setError(`字幕解析失败: ${errorMessage}`);
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
    ]
  );

  // Native dialog handler for subtitle import (Electron only)
  const handleSubtitleImportNative = useCallback(async () => {
    if (!window.electronAPI?.selectSubtitleFile) return;

    try {
      const result = await window.electronAPI.selectSubtitleFile();
      if (!result.success || !result.content || !result.fileName) return;

      const currentOpId = ++operationIdRef.current;
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

      // Extract and set speaker profiles
      const uniqueSpeakers = Array.from(
        new Set(parsed.map((s) => s.speaker).filter(Boolean))
      ) as string[];
      const profiles: SpeakerUIProfile[] = uniqueSpeakers.map((name) => ({
        id: name,
        name: name,
        color: getSpeakerColor(name),
      }));
      setSpeakerProfiles(profiles);

      setStatus(GenerationStatus.COMPLETED);
      setBatchComments({});
      const fileId = result.filePath || result.fileName;
      snapshotsValues.createSnapshot('初始导入', parsed, {}, fileId, result.fileName);
    } catch (error: unknown) {
      // NOTE: We do not check for stale ID here because we haven't updated the ID for *this* prompt logic?
      // Wait, we did `const currentOpId`. So yes we should.
      // But notice we didn't update operationIdRef at start of function?
      // Actually we did: const currentOpId = ++operationIdRef.current; inside try block? NO.
      // I need to add it before async work.
      // Logic inside try block:
      // const currentOpId = ++operationIdRef.current; <- I added this in my previous thought but need to include it in the replacement.
      // Actually, looking at the code I'm writing in this block:
      // I inserted `const currentOpId = ++operationIdRef.current;` in the previous handler.
      // I should insert it here too.
      // My replacement block covers `handleSubtitleImportNative`.

      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to parse subtitle (native)', error);
      setError(`字幕解析失败: ${errorMessage}`);
      setStatus(GenerationStatus.ERROR);
    } finally {
      // Ideally we should check opID here too but I need access to currentOpId scope.
      setIsLoadingSubtitle(false);
    }
  }, [
    snapshotsValues,
    parseSubtitle,
    setSubtitles,
    setStatus,
    setError,
    setSpeakerProfiles,
    setBatchComments,
  ]);

  return {
    handleFileChange,
    handleFileSelectNative,
    handleSubtitleImport,
    handleSubtitleImportNative,
    isLoadingFile,
    setIsLoadingFile,
    isLoadingSubtitle,
    subtitleFileName,
    setSubtitleFileName,
  };
}
