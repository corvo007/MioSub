import React, { useState, useRef, useEffect } from 'react';
import { SubtitleItem, SubtitleSnapshot, BatchOperationMode } from '@/types/subtitle';
import { useSpeakerProfiles } from './useWorkspaceLogic/useSpeakerProfiles';
import { useBatchSelection } from './useWorkspaceLogic/useBatchSelection';
import { useSubtitleCRUD } from './useWorkspaceLogic/useSubtitleCRUD';
import { AppSettings } from '@/types/settings';
import {
  GlossaryItem,
  GlossaryExtractionResult,
  GlossaryExtractionMetadata,
} from '@/types/glossary';
import { GenerationStatus, ChunkStatus } from '@/types/api';
import { SpeakerUIProfile } from '@/types/speaker';
import { generateSrtContent, generateAssContent } from '@/services/subtitle/generator';
import { downloadFile } from '@/services/subtitle/downloader';
import { logger } from '@/services/utils/logger';
import { mergeGlossaryResults } from '@/services/glossary/merger';
import { createGlossary } from '@/services/glossary/manager';
import { generateSubtitles } from '@/services/api/gemini/subtitle';
import { runBatchOperation } from '@/services/api/gemini/batch';
import { retryGlossaryExtraction } from '@/services/api/gemini/glossary';
import { useFileParserWorker } from '@/hooks/useFileParserWorker';
import { decodeAudioWithRetry } from '@/services/audio/decoder';
import { getSpeakerColor } from '@/utils/colors';
import { ENV } from '@/config/env';

interface UseWorkspaceLogicProps {
  settings: AppSettings;
  updateSetting: (key: keyof AppSettings, value: any) => void;
  addToast: (
    message: string,
    type: 'success' | 'error' | 'info' | 'warning',
    duration?: number
  ) => void;
  showConfirm: (
    title: string,
    message: string,
    onConfirm: () => void,
    type?: 'info' | 'warning' | 'danger'
  ) => void;
  glossaryFlow: {
    glossaryMetadata: GlossaryExtractionMetadata | null;
    setGlossaryMetadata: (data: GlossaryExtractionMetadata | null) => void;
    setPendingGlossaryResults: (results: GlossaryExtractionResult[]) => void;
    setShowGlossaryConfirmation: (show: boolean) => void;
    setShowGlossaryFailure: (show: boolean) => void;
    glossaryConfirmCallback: ((items: GlossaryItem[]) => void) | null;
    setGlossaryConfirmCallback: (cb: ((items: GlossaryItem[]) => void) | null) => void;
    setIsGeneratingGlossary: (isGenerating: boolean) => void;
  };
  snapshotsValues: {
    setSnapshots: (snapshots: SubtitleSnapshot[]) => void;
    createSnapshot: (
      description: string,
      subtitles: SubtitleItem[],
      batchComments?: Record<number, string>,
      fileId?: string,
      fileName?: string
    ) => void;
    createAutoSaveSnapshot: (
      subtitles: SubtitleItem[],
      batchComments: Record<number, string>,
      fileId?: string,
      fileName?: string
    ) => boolean;
    deleteSnapshot: (id: string) => void;
  };
  setShowSettings: (show: boolean) => void;
}

export const useWorkspaceLogic = ({
  settings,
  updateSetting,
  addToast,
  showConfirm,
  glossaryFlow,
  snapshotsValues,
  setShowSettings,
}: UseWorkspaceLogicProps) => {
  // State
  const { parseSubtitle, cleanup } = useFileParserWorker();
  const [file, setFile] = useState<File | null>(null);
  const [duration, setDuration] = useState<number>(0);
  const [status, setStatus] = useState<GenerationStatus>(GenerationStatus.IDLE);
  const [progressMsg, setProgressMsg] = useState('');
  const [chunkProgress, setChunkProgress] = useState<Record<string, ChunkStatus>>({});
  const [subtitles, setSubtitles] = useState<SubtitleItem[]>([]);
  const subtitlesRef = useRef(subtitles);
  useEffect(() => {
    subtitlesRef.current = subtitles;
  }, [subtitles]);
  const [error, setError] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<number | null>(null);

  // Batch & View State (extracted to useBatchSelection)
  const {
    selectedBatches,
    setSelectedBatches,
    batchComments,
    setBatchComments,
    showSourceText,
    setShowSourceText,
    editingCommentId,
    setEditingCommentId,
    toggleBatch,
    toggleAllBatches,
    selectBatchesWithComments,
    updateBatchComment,
    resetBatchState,
  } = useBatchSelection();

  // Subtitle CRUD (extracted to useSubtitleCRUD)
  const {
    updateSubtitleText,
    updateSubtitleOriginal,
    updateSpeaker,
    updateSubtitleTime,
    updateLineComment,
    deleteSubtitle,
    deleteMultipleSubtitles,
    addSubtitle,
  } = useSubtitleCRUD({ setSubtitles });

  // Speaker Profiles (extracted to useSpeakerProfiles)
  const {
    speakerProfiles,
    setSpeakerProfiles,
    addSpeaker,
    renameSpeaker,
    deleteSpeaker,
    mergeSpeakers,
  } = useSpeakerProfiles({ subtitles, setSubtitles });

  // Refs
  const audioCacheRef = useRef<{ file: File; buffer: AudioBuffer } | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [snapshotBeforeOperation, setSnapshotBeforeOperation] = useState<SubtitleItem[] | null>(
    null
  );

  // Auto-save snapshot every 5 minutes (only if subtitles have changed)
  React.useEffect(() => {
    const AUTO_SAVE_INTERVAL = 5 * 60 * 1000; // 5 minutes

    const intervalId = setInterval(() => {
      if (subtitles.length > 0 && status === GenerationStatus.COMPLETED && file) {
        const fileId = window.electronAPI?.getFilePath?.(file) || file.name;
        const saved = snapshotsValues.createAutoSaveSnapshot(
          subtitles,
          batchComments,
          fileId,
          file.name
        );
        if (saved) {
          logger.info('Auto-save snapshot created');
        }
      }
    }, AUTO_SAVE_INTERVAL);

    return () => clearInterval(intervalId);
  }, [subtitles, batchComments, status, snapshotsValues, file]);

  // Helpers
  const cancelOperation = React.useCallback(() => {
    if (abortControllerRef.current) {
      logger.info('User cancelled operation');
      abortControllerRef.current.abort();

      // Call local whisper abort if applicable
      if (window.electronAPI?.abortLocalWhisper) {
        window.electronAPI.abortLocalWhisper();
      }
    }
  }, []);

  const getFileDuration = async (f: File): Promise<number> => {
    // Electron Optimization: Use FFmpeg via Main Process
    if (window.electronAPI && window.electronAPI.getAudioInfo) {
      const path = window.electronAPI.getFilePath(f);
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
        resolve(0);
        URL.revokeObjectURL(url);
      };
    });
  };

  const handleProgress = (update: ChunkStatus) => {
    setChunkProgress((prev) => ({ ...prev, [update.id]: update }));
    if (update.message) setProgressMsg(update.message);
    if (update.toast) {
      addToast(update.toast.message, update.toast.type);
    }
  };

  // Handlers
  // Common file processing logic
  const processFileInternal = React.useCallback(
    async (selectedFile: File) => {
      const process = async () => {
        logger.info('File selected', {
          name: selectedFile.name,
          size: selectedFile.size,
          type: selectedFile.type,
        });
        setFile(selectedFile);
        audioCacheRef.current = null;
        setError(null);
        try {
          const d = await getFileDuration(selectedFile);
          setDuration(d);
        } catch (e) {
          logger.warn('Failed to get file duration, defaulting to 0', e);
          setDuration(0);
        }
      };

      // Only warn if we are REPLACING an existing file (and have subtitles)
      // If we just have subtitles but no file (e.g. imported SRT first), just load the file
      if (file && subtitles.length > 0 && status === GenerationStatus.COMPLETED) {
        showConfirm(
          '确认替换文件',
          '替换文件后将清空当前字幕。建议先导出字幕（SRT/ASS）再操作。是否继续？',
          () => {
            setSubtitles([]);
            setStatus(GenerationStatus.IDLE);
            snapshotsValues.setSnapshots([]);
            setBatchComments({});
            process();
          },
          'warning'
        );
      } else {
        await process();
      }
    },
    [file, subtitles.length, status, snapshotsValues, showConfirm]
  );

  // Handlers
  const handleFileChange = React.useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>, activeTab: 'new' | 'import') => {
      if (e.target.files && e.target.files[0]) {
        // Only use confirmation logic for 'new' tab if needed, but logic is now inside processFileInternal which checks subtitles/status
        // However, the original code only checked activeTab === 'new' before prompting.
        // Let's preserve that logic slightly differently:
        // Actually, simply calling processFileInternal is fine, as it checks subtitles/status.
        // The original code only prompted if activeTab === 'new'. If activeTab === 'import' (which doesn't exist anymore for file selection, only for subtitle import?),
        // wait, useWorkspaceLogic doesn't know about UI tabs.
        // Looking at usage in WorkspacePage, handleFileChange is called with 'new' or 'import'.

        // If we are in 'import' tab (importing subtitle), we use handleSubtitleImport.
        // So handleFileChange is only for media file.
        // The activeTab arg seems to differentiate where the file input is.

        await processFileInternal(e.target.files[0]);
      }
    },
    [processFileInternal]
  );

  const handleFileSelectNative = React.useCallback(
    async (file: File) => {
      await processFileInternal(file);
    },
    [processFileInternal]
  );

  const handleSubtitleImport = React.useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
        const subFile = e.target.files[0];
        logger.info('Subtitle file imported', { name: subFile.name });

        try {
          addToast('正在解析字幕...', 'info', 2000);
          // Allow toast to render before heavy parsing
          await new Promise((resolve) => setTimeout(resolve, 50));

          const content = await subFile.text();
          const fileType = subFile.name.endsWith('.ass') ? 'ass' : 'srt';

          const parsed = await parseSubtitle(content, fileType);

          setSubtitles(parsed);

          // Extract and set speaker profiles
          const uniqueSpeakers = Array.from(
            new Set(parsed.map((s) => s.speaker).filter(Boolean))
          ) as string[];
          const profiles: SpeakerUIProfile[] = uniqueSpeakers.map((name) => ({
            id: name,
            name: name,
            color: getSpeakerColor(name),
          }));
          // Only set if we found speakers, to avoid clearing existing if any (though usually import replaces everything)
          // Actually, import replaces subtitles, so we should replace profiles too.
          setSpeakerProfiles(profiles);

          setStatus(GenerationStatus.COMPLETED);
          snapshotsValues.setSnapshots([]);
          setBatchComments({});
          const fileId = window.electronAPI?.getFilePath?.(subFile) || subFile.name;
          snapshotsValues.createSnapshot('初始导入', parsed, {}, fileId, subFile.name);
        } catch (error: any) {
          logger.error('Failed to parse subtitle', error);
          setError(`字幕解析失败: ${error.message}`);
          setStatus(GenerationStatus.ERROR);
        }
      }
    },
    [snapshotsValues, parseSubtitle]
  );

  // Native dialog handler for subtitle import (Electron only)
  const handleSubtitleImportNative = React.useCallback(async () => {
    if (!window.electronAPI?.selectSubtitleFile) return;

    try {
      const result = await window.electronAPI.selectSubtitleFile();
      if (!result.success || !result.content || !result.fileName) return;

      logger.info('Subtitle file imported (native)', { name: result.fileName });
      addToast('正在解析字幕...', 'info', 2000);
      await new Promise((resolve) => setTimeout(resolve, 50));

      const fileType = result.fileName.endsWith('.ass') ? 'ass' : 'srt';
      const parsed = await parseSubtitle(result.content, fileType);

      setSubtitles(parsed);

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
      snapshotsValues.setSnapshots([]);
      setBatchComments({});
      const fileId = result.filePath || result.fileName;
      snapshotsValues.createSnapshot('初始导入', parsed, {}, fileId, result.fileName);
    } catch (error: any) {
      logger.error('Failed to parse subtitle (native)', error);
      setError(`字幕解析失败: ${error.message}`);
      setStatus(GenerationStatus.ERROR);
    }
  }, [snapshotsValues, parseSubtitle, addToast]);

  const handleGenerate = React.useCallback(async () => {
    if (!file) {
      setError('请先上传媒体文件。');
      return;
    }
    const hasGemini = !!(settings.geminiKey || ENV.GEMINI_API_KEY);
    const hasOpenAI = !!(settings.openaiKey || ENV.OPENAI_API_KEY);
    const hasLocalWhisper = !!settings.useLocalWhisper;

    if (!hasGemini || (!hasOpenAI && !hasLocalWhisper)) {
      setError('API 密钥未配置，请在设置中添加。');
      setShowSettings(true);
      return;
    }
    setStatus(GenerationStatus.UPLOADING);
    setError(null);
    setSubtitles([]);
    snapshotsValues.setSnapshots([]);
    setBatchComments({});
    setSelectedBatches(new Set());
    setChunkProgress({});
    setStartTime(Date.now());
    logger.info('Starting subtitle generation', {
      file: file.name,
      duration,
      settings: { ...settings, geminiKey: '***', openaiKey: '***' },
    });
    // Create new AbortController
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    try {
      setStatus(GenerationStatus.PROCESSING);

      // Prepare runtime settings with active glossary terms
      const activeGlossary = settings.glossaries?.find((g) => g.id === settings.activeGlossaryId);
      const runtimeSettings = {
        ...settings,
        glossary: activeGlossary?.terms || settings.glossary || [],
      };

      // Decode audio first to cache it for retries
      let audioBuffer: AudioBuffer;
      try {
        if (audioCacheRef.current && audioCacheRef.current.file === file) {
          audioBuffer = audioCacheRef.current.buffer;
        } else {
          handleProgress({
            id: 'decoding',
            total: 1,
            status: 'processing',
            message: '正在解码音频...',
          });
          audioBuffer = await decodeAudioWithRetry(file);
          audioCacheRef.current = { file, buffer: audioBuffer };
        }
      } catch (e) {
        logger.error('Failed to decode audio in handleGenerate', e);
        throw new Error('音频解码失败，请确保文件是有效的视频或音频格式。');
      }

      const { subtitles: result, glossaryResults } = await generateSubtitles(
        audioBuffer,
        duration,
        runtimeSettings,
        handleProgress,
        (newSubs) => setSubtitles(newSubs),
        // onGlossaryReady callback (Blocking)
        async (metadata: GlossaryExtractionMetadata) => {
          logger.info('onGlossaryReady called with metadata:', metadata);

          if (settings.glossaryAutoConfirm && !metadata.hasFailures) {
            const { unique, conflicts } = mergeGlossaryResults(metadata.results);

            // For conflicts, auto-select the first new option (not the existing one)
            const autoResolvedConflicts = conflicts.map((c) => {
              // Find the first non-existing option
              const newOption = c.options.find((opt) => !c.hasExisting || opt !== c.options[0]);
              return newOption || c.options[0];
            });

            // Combine unique terms and auto-resolved conflicts
            const allTerms = [...unique, ...autoResolvedConflicts];

            // Ensure we have a glossaries array
            const currentGlossaries = settings.glossaries || [];

            // Find or create an active glossary
            let targetGlossaryId = settings.activeGlossaryId;
            let updatedGlossaries = [...currentGlossaries];

            // If no active glossary, create a new one for auto-extracted terms
            if (!targetGlossaryId || !currentGlossaries.find((g) => g.id === targetGlossaryId)) {
              const newGlossary = createGlossary('自动提取术语');
              newGlossary.terms = [];
              updatedGlossaries = [...currentGlossaries, newGlossary];
              targetGlossaryId = newGlossary.id;
              logger.info('Auto-created new glossary for extracted terms');
            }

            const activeG = updatedGlossaries.find((g) => g.id === targetGlossaryId);
            const activeTerms = activeG?.terms || (activeG as any)?.items || [];
            const existingTerms = new Set(activeTerms.map((g: any) => g.term.toLowerCase()));
            const newTerms = allTerms.filter((t) => !existingTerms.has(t.term.toLowerCase()));

            if (newTerms.length > 0 || updatedGlossaries !== currentGlossaries) {
              const finalGlossaries = updatedGlossaries.map((g) => {
                if (g.id === targetGlossaryId) {
                  const currentTerms = g.terms || (g as any).items || [];
                  return { ...g, terms: [...currentTerms, ...newTerms] };
                }
                return g;
              });
              updateSetting('glossaries', finalGlossaries);
              updateSetting('activeGlossaryId', targetGlossaryId);
              logger.info(`Auto-added ${newTerms.length} terms to glossary`);
              const updatedActive = finalGlossaries.find((g) => g.id === targetGlossaryId);
              return updatedActive?.terms || [];
            }
            return activeTerms;
          }

          // Manual confirmation required
          return new Promise<GlossaryItem[]>((resolve, reject) => {
            // Check if already aborted
            if (signal?.aborted) {
              reject(new Error('Operation cancelled'));
              return;
            }

            const onAbort = () => {
              logger.info('Glossary confirmation aborted by signal');
              // Cleanup UI
              glossaryFlow.setShowGlossaryConfirmation(false);
              glossaryFlow.setShowGlossaryFailure(false);
              glossaryFlow.setPendingGlossaryResults([]);
              glossaryFlow.setGlossaryMetadata(null);
              glossaryFlow.setGlossaryConfirmCallback(null);
              reject(new Error('Operation cancelled'));
            };

            signal?.addEventListener('abort', onAbort);

            logger.info('Setting up UI for manual glossary confirmation...');
            glossaryFlow.setGlossaryMetadata(metadata);

            // Store the resolve function
            glossaryFlow.setGlossaryConfirmCallback(() => (confirmedItems: GlossaryItem[]) => {
              signal?.removeEventListener('abort', onAbort);
              logger.info('User confirmed glossary terms:', confirmedItems.length);
              // Settings are already updated by GlossaryConfirmationModal

              // Cleanup UI
              glossaryFlow.setShowGlossaryConfirmation(false);
              glossaryFlow.setShowGlossaryFailure(false);
              glossaryFlow.setPendingGlossaryResults([]);
              glossaryFlow.setGlossaryMetadata(null);
              glossaryFlow.setGlossaryConfirmCallback(null);

              resolve(confirmedItems);
            });

            if (metadata.totalTerms > 0) {
              glossaryFlow.setPendingGlossaryResults(metadata.results);
              glossaryFlow.setShowGlossaryConfirmation(true);
            } else if (metadata.hasFailures) {
              glossaryFlow.setShowGlossaryFailure(true);
            } else {
              // Should not happen if gemini.ts logic is correct, but safe fallback
              signal?.removeEventListener('abort', onAbort);
              if (settings.activeGlossaryId && settings.glossaries) {
                const activeG = settings.glossaries.find((g) => g.id === settings.activeGlossaryId);
                resolve(activeG?.terms || []);
              } else {
                resolve(settings.glossary || []);
              }
            }
          });
        },
        signal
      );

      // Then check subtitle results
      if (result.length === 0) throw new Error('未生成任何字幕。');

      setSubtitles(result);
      setStatus(GenerationStatus.COMPLETED);
      const fileId = file ? window.electronAPI?.getFilePath?.(file) || file.name : '';
      const fileName = file?.name || '';
      snapshotsValues.createSnapshot('初始生成', result, {}, fileId, fileName);

      logger.info('Subtitle generation completed', { count: result.length });
      addToast('字幕生成成功！', 'success');
    } catch (err: any) {
      // Check if it was a cancellation
      if (err.message === 'Operation cancelled' || signal.aborted) {
        setStatus(GenerationStatus.CANCELLED);
        logger.info('Generation cancelled by user');

        // Keep partial results (subtitles state already updated via onIntermediateResult)
        if (subtitlesRef.current.length > 0) {
          const fileId = file ? window.electronAPI?.getFilePath?.(file) || file.name : '';
          const fileName = file?.name || '';
          snapshotsValues.createSnapshot(
            '部分生成 (已终止)',
            subtitlesRef.current,
            batchComments,
            fileId,
            fileName
          );
          addToast('生成已终止，保留部分结果', 'warning');
        } else {
          addToast('生成已终止', 'info');
        }
      } else {
        setStatus(GenerationStatus.ERROR);
        setError(err.message);
        logger.error('Subtitle generation failed', err);
        addToast(`生成失败：${err.message}`, 'error');
      }
    } finally {
      abortControllerRef.current = null;
    }
  }, [
    file,
    settings,
    duration,
    glossaryFlow,
    snapshotsValues,
    updateSetting,
    addToast,
    setShowSettings,
    subtitles,
    batchComments,
  ]);

  const handleBatchAction = React.useCallback(
    async (mode: BatchOperationMode, singleIndex?: number) => {
      const indices: number[] =
        singleIndex !== undefined ? [singleIndex] : (Array.from(selectedBatches) as number[]);
      if (indices.length === 0) return;
      if (!settings.geminiKey && !ENV.GEMINI_API_KEY) {
        setError('缺少 API 密钥。');
        return;
      }
      if (mode === 'fix_timestamps' && !file) {
        setError('校对时间轴需要源视频或音频文件。');
        return;
      }

      // Save current state BEFORE operation
      setSnapshotBeforeOperation([...subtitles]);

      // Create snapshot BEFORE AI operation for user recovery
      const actionName = mode === 'fix_timestamps' ? '校对时间轴' : '润色翻译';
      const fileId = file ? window.electronAPI?.getFilePath?.(file) || file.name : '';
      const fileName = file?.name || '';
      snapshotsValues.createSnapshot(
        `${actionName}前备份`,
        subtitles,
        batchComments,
        fileId,
        fileName
      );

      // Create new AbortController
      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;

      setStatus(GenerationStatus.PROOFREADING);
      setError(null);
      setChunkProgress({});
      setStartTime(Date.now());
      logger.info(`Starting batch action: ${mode}`, { indices, mode });
      try {
        const refined = await runBatchOperation(
          file,
          subtitles,
          indices,
          settings,
          mode,
          batchComments,
          handleProgress,
          signal
        );
        setSubtitles(refined);
        setStatus(GenerationStatus.COMPLETED);
        setBatchComments((prev) => {
          const next = { ...prev };
          indices.forEach((idx) => delete next[idx]);
          return next;
        });
        if (singleIndex === undefined) setSelectedBatches(new Set());
        logger.info(`Batch action ${mode} completed`);
        addToast(`批量操作 '${actionName}' 完成！`, 'success');
      } catch (err: any) {
        // Check if it was a cancellation
        if (err.message === 'Operation cancelled' || signal.aborted) {
          setStatus(GenerationStatus.CANCELLED);
          logger.info('Batch operation cancelled by user');

          // Restore from snapshot
          if (snapshotBeforeOperation) {
            setSubtitles(snapshotBeforeOperation);
            addToast('操作已终止，已恢复原状态', 'warning');
          } else {
            addToast('操作已终止', 'info');
          }
        } else {
          setStatus(GenerationStatus.ERROR);
          setError(`操作失败: ${err.message}`);
          logger.error(`Batch action ${mode} failed`, err);
          addToast(`操作失败：${err.message}`, 'error');
        }
      } finally {
        abortControllerRef.current = null;
        setSnapshotBeforeOperation(null);
      }
    },
    [
      file,
      subtitles,
      selectedBatches,
      settings,
      batchComments,
      snapshotsValues,
      addToast,
      snapshotBeforeOperation,
    ]
  );

  const handleDownload = React.useCallback(
    (format: 'srt' | 'ass') => {
      if (subtitles.length === 0) return;
      const isBilingual = settings.outputMode === 'bilingual';
      const includeSpeaker = settings.includeSpeakerInExport || false;
      const content =
        format === 'srt'
          ? generateSrtContent(subtitles, isBilingual, includeSpeaker)
          : generateAssContent(
              subtitles,
              file ? file.name : 'video',
              isBilingual,
              includeSpeaker,
              settings.useSpeakerColors
            );
      const filename = file ? file.name.replace(/\.[^/.]+$/, '') : 'subtitles';
      logger.info(`Downloading subtitles: ${filename}.${format}`);
      downloadFile(`${filename}.${format}`, content, format);
    },
    [subtitles, settings.outputMode, settings.includeSpeakerInExport, file]
  );

  const handleRetryGlossary = React.useCallback(async () => {
    if (!glossaryFlow.glossaryMetadata?.glossaryChunks || !audioCacheRef.current) return;

    glossaryFlow.setIsGeneratingGlossary(true);
    try {
      const apiKey = settings.geminiKey || ENV.GEMINI_API_KEY;
      const newMetadata = await retryGlossaryExtraction(
        apiKey,
        audioCacheRef.current.buffer,
        glossaryFlow.glossaryMetadata.glossaryChunks,
        settings.genre,
        settings.concurrencyPro,
        settings.geminiEndpoint,
        (settings.requestTimeout || 600) * 1000
      );

      glossaryFlow.setGlossaryMetadata(newMetadata);
      if (newMetadata.totalTerms > 0 || newMetadata.hasFailures) {
        if (newMetadata.totalTerms > 0) {
          glossaryFlow.setPendingGlossaryResults(newMetadata.results);
          glossaryFlow.setShowGlossaryConfirmation(true);
          glossaryFlow.setShowGlossaryFailure(false);
        } else {
          glossaryFlow.setShowGlossaryFailure(true); // Still failed
        }
      } else {
        // Empty results, no failure
        if (glossaryFlow.glossaryConfirmCallback) {
          glossaryFlow.glossaryConfirmCallback(settings.glossary || []);
          glossaryFlow.setGlossaryConfirmCallback(null);
        }
        glossaryFlow.setShowGlossaryFailure(false);
        glossaryFlow.setGlossaryMetadata(null);
      }
    } catch (e) {
      logger.error('Retry failed', e);
      setError('Retry failed: ' + (e as Error).message);
    } finally {
      glossaryFlow.setIsGeneratingGlossary(false);
    }
  }, [glossaryFlow, settings]);

  const resetWorkspace = React.useCallback(() => {
    setSubtitles([]);
    setFile(null);
    setDuration(0);
    setStatus(GenerationStatus.IDLE);
    snapshotsValues.setSnapshots([]);
    setBatchComments({});
    setSelectedBatches(new Set());
    setError(null);
  }, [snapshotsValues]);

  const loadFileFromPath = React.useCallback(
    async (path: string) => {
      try {
        // Use IPC to read file buffer (bypassing CSP/Sandbox)
        const buffer = await window.electronAPI.readLocalFile(path);

        // Create a File object
        const filename = path.split(/[\\/]/).pop() || 'video.mp4';
        // Determine mime type based on extension
        const ext = filename.split('.').pop()?.toLowerCase();
        const type =
          ext === 'mp4' ? 'video/mp4' : ext === 'mkv' ? 'video/x-matroska' : 'video/webm';

        const file = new File([buffer], filename, { type });
        // Manually attach path for Electron/FFmpeg usage
        Object.defineProperty(file, 'path', {
          value: path,
          writable: false,
          enumerable: false, // standard File.path is not enumerable
          configurable: false,
        });

        logger.info('Loaded file from path', { path, size: file.size, type: file.type });

        setFile(file);
        audioCacheRef.current = null;
        setError(null);

        // Get duration
        try {
          const d = await getFileDuration(file);
          setDuration(d);
        } catch (e) {
          setDuration(0);
        }

        // Reset workspace state
        setSubtitles([]);
        setStatus(GenerationStatus.IDLE);
        snapshotsValues.setSnapshots([]);
        setBatchComments({});
        setSelectedBatches(new Set());
      } catch (e: any) {
        logger.error('Failed to load file from path', e);
        setError('无法加载文件: ' + e.message);
      }
    },
    [snapshotsValues]
  );

  useEffect(() => {
    return () => {
      cleanup();
      audioCacheRef.current = null;
    };
  }, [cleanup]);

  return React.useMemo(
    () => ({
      // State
      file,
      duration,
      status,
      progressMsg,
      chunkProgress,
      subtitles,
      setSubtitles,
      error,
      startTime,
      selectedBatches,
      batchComments,
      setBatchComments,
      showSourceText,
      setShowSourceText,
      editingCommentId,
      setEditingCommentId,

      // Handlers
      handleFileChange,
      handleFileSelectNative,
      handleSubtitleImport,
      handleSubtitleImportNative,
      handleGenerate,
      handleBatchAction,
      handleDownload,
      handleRetryGlossary,
      toggleBatch,
      toggleAllBatches,
      selectBatchesWithComments,
      updateBatchComment,
      updateLineComment,
      updateSubtitleText,
      updateSubtitleOriginal,
      updateSpeaker,
      updateSubtitleTime,
      deleteSubtitle,
      deleteMultipleSubtitles,
      addSubtitle,
      resetWorkspace,
      cancelOperation,
      loadFileFromPath,

      // Speaker Profiles
      speakerProfiles,
      addSpeaker,
      renameSpeaker,
      deleteSpeaker,
      mergeSpeakers,
    }),
    [
      file,
      duration,
      status,
      progressMsg,
      chunkProgress,
      subtitles,
      error,
      startTime,
      selectedBatches,
      batchComments,
      showSourceText,
      editingCommentId,
      handleFileChange,
      handleFileSelectNative,
      handleSubtitleImport,
      handleSubtitleImportNative,
      handleGenerate,
      handleBatchAction,
      handleDownload,
      handleRetryGlossary,
      toggleBatch,
      toggleAllBatches,
      selectBatchesWithComments,
      updateBatchComment,
      updateLineComment,
      updateSubtitleText,
      updateSubtitleOriginal,
      updateSpeaker,
      updateSubtitleTime,
      deleteSubtitle,
      deleteMultipleSubtitles,
      addSubtitle,
      resetWorkspace,
      cancelOperation,
      loadFileFromPath,
      speakerProfiles,
      addSpeaker,
      renameSpeaker,
      deleteSpeaker,
      mergeSpeakers,
    ]
  );
};
