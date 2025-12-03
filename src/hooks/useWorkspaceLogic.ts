import React, { useState, useRef, useEffect } from 'react';
import { SubtitleItem, SubtitleSnapshot, BatchOperationMode } from '@/types/subtitle';
import { AppSettings, GENRE_PRESETS } from '@/types/settings';
import { GlossaryItem, GlossaryExtractionResult, GlossaryExtractionMetadata } from '@/types/glossary';
import { GenerationStatus, ChunkStatus } from '@/types/api';
import { generateSrtContent, generateAssContent } from '@/services/subtitle/generator';
import { downloadFile } from '@/services/subtitle/downloader';
import { parseSrt, parseAss } from '@/services/subtitle/parser';
import { logger } from '@/services/utils/logger';
import { mergeGlossaryResults } from '@/services/glossary/merger';
import { generateSubtitles } from '@/services/api/gemini/subtitle';
import { runBatchOperation } from '@/services/api/gemini/batch';
import { retryGlossaryExtraction } from '@/services/api/gemini/glossary';
import { useFileParserWorker } from '@/hooks/useFileParserWorker';
import { decodeAudioWithRetry } from "@/services/audio/decoder";

import { getEnvVariable } from "@/services/utils/env";

const ENV_GEMINI_KEY = getEnvVariable('GEMINI_API_KEY') || '';
const ENV_OPENAI_KEY = getEnvVariable('OPENAI_API_KEY') || '';

interface UseWorkspaceLogicProps {
    settings: AppSettings;
    updateSetting: (key: keyof AppSettings, value: any) => void;
    addToast: (message: string, type: 'success' | 'error' | 'info' | 'warning', duration?: number) => void;
    showConfirm: (title: string, message: string, onConfirm: () => void, type?: 'info' | 'warning' | 'danger') => void;
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
        createSnapshot: (description: string, subtitles: SubtitleItem[], batchComments?: Record<number, string>) => void;
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
    setShowSettings
}: UseWorkspaceLogicProps) => {
    // State
    const { parseSubtitle, cleanup } = useFileParserWorker();
    const [file, setFile] = useState<File | null>(null);
    const [duration, setDuration] = useState<number>(0);
    const [status, setStatus] = useState<GenerationStatus>(GenerationStatus.IDLE);
    const [progressMsg, setProgressMsg] = useState('');
    const [chunkProgress, setChunkProgress] = useState<Record<string, ChunkStatus>>({});
    const [subtitles, setSubtitles] = useState<SubtitleItem[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [startTime, setStartTime] = useState<number | null>(null);

    // Batch & View State
    const [selectedBatches, setSelectedBatches] = useState<Set<number>>(new Set());
    const [batchComments, setBatchComments] = useState<Record<number, string>>({});
    const [showSourceText, setShowSourceText] = useState(true);
    const [editingCommentId, setEditingCommentId] = useState<number | null>(null);

    // Refs
    const audioCacheRef = useRef<{ file: File, buffer: AudioBuffer } | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);
    const [snapshotBeforeOperation, setSnapshotBeforeOperation] = useState<SubtitleItem[] | null>(null);

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
                    logger.warn("Failed to get duration via Electron API, falling back to DOM", e);
                }
            }
        }

        // Web / Fallback: Use DOM
        return new Promise((resolve) => {
            const element = f.type.startsWith('audio') ? new Audio() : document.createElement('video');
            element.preload = 'metadata';
            const url = URL.createObjectURL(f);
            element.src = url;
            element.onloadedmetadata = () => { resolve(element.duration); URL.revokeObjectURL(url); };
            element.onerror = () => { resolve(0); URL.revokeObjectURL(url); };
        });
    };

    const handleProgress = (update: ChunkStatus) => {
        setChunkProgress(prev => ({ ...prev, [update.id]: update }));
        if (update.message) setProgressMsg(update.message);
        if (update.toast) {
            addToast(update.toast.message, update.toast.type);
        }
    };

    // Handlers
    const handleFileChange = React.useCallback(async (e: React.ChangeEvent<HTMLInputElement>, activeTab: 'new' | 'import') => {
        if (e.target.files && e.target.files[0]) {
            const selectedFile = e.target.files[0];

            const processFile = async () => {
                logger.info("File selected", { name: selectedFile.name, size: selectedFile.size, type: selectedFile.type });
                setFile(selectedFile);
                audioCacheRef.current = null;
                setError(null);
                try { const d = await getFileDuration(selectedFile); setDuration(d); } catch (e) { setDuration(0); }
            };

            if (activeTab === 'new' && subtitles.length > 0 && status === GenerationStatus.COMPLETED) {
                showConfirm(
                    "确认替换文件",
                    "替换文件后将清空当前字幕，需重新生成。是否继续？",
                    () => {
                        setSubtitles([]); setStatus(GenerationStatus.IDLE); snapshotsValues.setSnapshots([]); setBatchComments({});
                        processFile();
                    },
                    'warning'
                );
            } else {
                processFile();
            }
        }
    }, [subtitles.length, status, snapshotsValues, showConfirm]);

    const handleSubtitleImport = React.useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const subFile = e.target.files[0];
            logger.info("Subtitle file imported", { name: subFile.name });

            try {
                addToast("正在解析字幕...", "info", 2000);

                const content = await subFile.text();
                const fileType = subFile.name.endsWith('.ass') ? 'ass' : 'srt';

                const parsed = await parseSubtitle(content, fileType);

                setSubtitles(parsed);
                setStatus(GenerationStatus.COMPLETED);
                snapshotsValues.setSnapshots([]);
                setBatchComments({});
                snapshotsValues.createSnapshot("初始导入", parsed, {});
            } catch (error: any) {
                logger.error("Failed to parse subtitle", error);
                setError(`字幕解析失败: ${error.message}`);
                setStatus(GenerationStatus.ERROR);
            }
        }
    }, [snapshotsValues, parseSubtitle]);

    const handleGenerate = React.useCallback(async () => {
        if (!file) { setError("请先上传媒体文件。"); return; }
        const hasGemini = !!(settings.geminiKey || ENV_GEMINI_KEY);
        const hasOpenAI = !!(settings.openaiKey || ENV_OPENAI_KEY);
        const hasLocalWhisper = !!settings.useLocalWhisper;

        if (!hasGemini || (!hasOpenAI && !hasLocalWhisper)) {
            setError("API 密钥未配置，请在设置中添加。"); setShowSettings(true); return;
        }
        setStatus(GenerationStatus.UPLOADING); setError(null); setSubtitles([]); snapshotsValues.setSnapshots([]); setBatchComments({}); setSelectedBatches(new Set()); setChunkProgress({}); setStartTime(Date.now());
        logger.info("Starting subtitle generation", { file: file.name, duration, settings: { ...settings, geminiKey: '***', openaiKey: '***' } });
        // Create new AbortController
        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;

        try {
            setStatus(GenerationStatus.PROCESSING);

            // Prepare runtime settings with active glossary terms
            const activeGlossary = settings.glossaries?.find(g => g.id === settings.activeGlossaryId);
            const runtimeSettings = {
                ...settings,
                glossary: activeGlossary?.terms || settings.glossary || []
            };

            // Decode audio first to cache it for retries
            let audioBuffer: AudioBuffer;
            try {
                if (audioCacheRef.current && audioCacheRef.current.file === file) {
                    audioBuffer = audioCacheRef.current.buffer;
                } else {
                    handleProgress({ id: 'decoding', total: 1, status: 'processing', message: "正在解码音频..." });
                    audioBuffer = await decodeAudioWithRetry(file);
                    audioCacheRef.current = { file, buffer: audioBuffer };
                }
            } catch (e) {
                logger.error("Failed to decode audio in handleGenerate", e);
                throw new Error("音频解码失败，请确保文件是有效的视频或音频格式。");
            }

            const { subtitles: result, glossaryResults } = await generateSubtitles(
                audioBuffer,
                duration,
                runtimeSettings,
                handleProgress,
                (newSubs) => setSubtitles(newSubs),
                // onGlossaryReady callback (Blocking)
                async (metadata: GlossaryExtractionMetadata) => {
                    logger.info("onGlossaryReady called with metadata:", metadata);

                    if (settings.glossaryAutoConfirm && !metadata.hasFailures) {
                        const { unique } = mergeGlossaryResults(metadata.results);

                        if (settings.activeGlossaryId && settings.glossaries) {
                            const activeG = settings.glossaries.find(g => g.id === settings.activeGlossaryId);
                            const activeTerms = activeG?.terms || (activeG as any)?.items || [];
                            const existingTerms = new Set(activeTerms.map((g: any) => g.term.toLowerCase()));
                            const newTerms = unique.filter(t => !existingTerms.has(t.term.toLowerCase()));

                            if (newTerms.length > 0) {
                                const updatedGlossaries = settings.glossaries.map(g => {
                                    if (g.id === settings.activeGlossaryId) {
                                        const currentTerms = g.terms || (g as any).items || [];
                                        return { ...g, terms: [...currentTerms, ...newTerms] };
                                    }
                                    return g;
                                });
                                updateSetting('glossaries', updatedGlossaries);
                                logger.info(`Auto-added ${newTerms.length} terms to active glossary`);
                                const updatedActive = updatedGlossaries.find(g => g.id === settings.activeGlossaryId);
                                return updatedActive?.terms || [];
                            }
                            return activeTerms;
                        } else {
                            // Fallback for legacy
                            const existingTerms = new Set(settings.glossary?.map(g => g.term.toLowerCase()) || []);
                            const newTerms = unique.filter(t => !existingTerms.has(t.term.toLowerCase()));
                            if (newTerms.length > 0) {
                                const updatedGlossary = [...(settings.glossary || []), ...newTerms];
                                updateSetting('glossary', updatedGlossary);
                                logger.info(`Auto-added ${newTerms.length} terms to glossary`);
                                return updatedGlossary;
                            }
                            return settings.glossary || [];
                        }
                    }

                    // Manual confirmation required
                    return new Promise<GlossaryItem[]>((resolve, reject) => {
                        // Check if already aborted
                        if (signal?.aborted) {
                            reject(new Error('Operation cancelled'));
                            return;
                        }

                        const onAbort = () => {
                            logger.info("Glossary confirmation aborted by signal");
                            // Cleanup UI
                            glossaryFlow.setShowGlossaryConfirmation(false);
                            glossaryFlow.setShowGlossaryFailure(false);
                            glossaryFlow.setPendingGlossaryResults([]);
                            glossaryFlow.setGlossaryMetadata(null);
                            glossaryFlow.setGlossaryConfirmCallback(null);
                            reject(new Error('Operation cancelled'));
                        };

                        signal?.addEventListener('abort', onAbort);

                        logger.info("Setting up UI for manual glossary confirmation...");
                        glossaryFlow.setGlossaryMetadata(metadata);

                        // Store the resolve function
                        glossaryFlow.setGlossaryConfirmCallback(() => (confirmedItems: GlossaryItem[]) => {
                            signal?.removeEventListener('abort', onAbort);
                            logger.info("User confirmed glossary terms:", confirmedItems.length);
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
                                const activeG = settings.glossaries.find(g => g.id === settings.activeGlossaryId);
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
            if (result.length === 0) throw new Error("未生成任何字幕。");

            setSubtitles(result);
            setStatus(GenerationStatus.COMPLETED);
            snapshotsValues.createSnapshot("初始生成", result, {});

            logger.info("Subtitle generation completed", { count: result.length });
            addToast("字幕生成成功！", "success");
        } catch (err: any) {
            // Check if it was a cancellation
            if (err.message === 'Operation cancelled' || signal.aborted) {
                setStatus(GenerationStatus.CANCELLED);
                logger.info('Generation cancelled by user');

                // Keep partial results (subtitles state already updated via onIntermediateResult)
                if (subtitles.length > 0) {
                    snapshotsValues.createSnapshot('部分生成 (已终止)', subtitles, batchComments);
                    addToast('生成已终止，保留部分结果', 'warning');
                } else {
                    addToast('生成已终止', 'info');
                }
            } else {
                setStatus(GenerationStatus.ERROR);
                setError(err.message);
                logger.error("Subtitle generation failed", err);
                addToast(`生成失败：${err.message}`, "error");
            }
        } finally {
            abortControllerRef.current = null;
        }
    }, [file, settings, duration, glossaryFlow, snapshotsValues, updateSetting, addToast, setShowSettings, subtitles, batchComments]);

    const handleBatchAction = React.useCallback(async (mode: BatchOperationMode, singleIndex?: number) => {
        const indices: number[] = singleIndex !== undefined ? [singleIndex] : Array.from(selectedBatches) as number[];
        if (indices.length === 0) return;
        if (!settings.geminiKey && !ENV_GEMINI_KEY) { setError("缺少 API 密钥。"); return; }
        if (mode === 'fix_timestamps' && !file) { setError("校对时间轴需要源视频或音频文件。"); return; }

        // Save current state BEFORE operation
        setSnapshotBeforeOperation([...subtitles]);

        // Create new AbortController
        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;

        setStatus(GenerationStatus.PROOFREADING); setError(null); setChunkProgress({}); setStartTime(Date.now());
        logger.info(`Starting batch action: ${mode}`, { indices, mode });
        try {
            const refined = await runBatchOperation(file, subtitles, indices, settings, mode, batchComments, handleProgress, signal);
            setSubtitles(refined); setStatus(GenerationStatus.COMPLETED);
            setBatchComments(prev => { const next = { ...prev }; indices.forEach(idx => delete next[idx]); return next; });
            if (singleIndex === undefined) setSelectedBatches(new Set());
            const actionName = mode === 'fix_timestamps' ? '校对时间轴' : '润色翻译';
            snapshotsValues.createSnapshot(`${actionName} (${indices.length} 个片段)`, refined);
            logger.info(`Batch action ${mode} completed`);
            addToast(`批量操作 '${actionName}' 完成！`, "success");
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
                addToast(`操作失败：${err.message}`, "error");
            }
        } finally {
            abortControllerRef.current = null;
            setSnapshotBeforeOperation(null);
        }
    }, [file, subtitles, selectedBatches, settings, batchComments, snapshotsValues, addToast, snapshotBeforeOperation]);

    const handleDownload = React.useCallback((format: 'srt' | 'ass') => {
        if (subtitles.length === 0) return;
        const isBilingual = settings.outputMode === 'bilingual';
        const includeSpeaker = settings.includeSpeakerInExport || false;
        const content = format === 'srt'
            ? generateSrtContent(subtitles, isBilingual, includeSpeaker)
            : generateAssContent(subtitles, file ? file.name : "video", isBilingual, includeSpeaker);
        const filename = file ? file.name.replace(/\.[^/.]+$/, "") : "subtitles";
        logger.info(`Downloading subtitles: ${filename}.${format}`);
        downloadFile(`${filename}.${format}`, content, format);
    }, [subtitles, settings.outputMode, settings.includeSpeakerInExport, file]);

    const handleRetryGlossary = React.useCallback(async () => {
        if (!glossaryFlow.glossaryMetadata?.glossaryChunks || !audioCacheRef.current) return;

        glossaryFlow.setIsGeneratingGlossary(true);
        try {
            const apiKey = settings.geminiKey || ENV_GEMINI_KEY;
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
            logger.error("Retry failed", e);
            setError("Retry failed: " + (e as Error).message);
        } finally {
            glossaryFlow.setIsGeneratingGlossary(false);
        }
    }, [glossaryFlow, settings]);

    const toggleBatch = React.useCallback((index: number) => {
        const newSet = new Set(selectedBatches);
        if (newSet.has(index)) newSet.delete(index);
        else newSet.add(index);
        setSelectedBatches(newSet);
    }, [selectedBatches]);

    const toggleAllBatches = React.useCallback((totalBatches: number) => {
        if (selectedBatches.size === totalBatches) setSelectedBatches(new Set());
        else setSelectedBatches(new Set(Array.from({ length: totalBatches }, (_, i) => i)));
    }, [selectedBatches]);

    const selectBatchesWithComments = React.useCallback((chunks: SubtitleItem[][]) => {
        const newSet = new Set<number>();
        chunks.forEach((chunk, idx) => {
            const hasBatchComment = batchComments[idx] && batchComments[idx].trim().length > 0;
            const hasLineComments = chunk.some(s => s.comment && s.comment.trim().length > 0);
            if (hasBatchComment || hasLineComments) newSet.add(idx);
        });
        setSelectedBatches(newSet);
    }, [batchComments]);

    const updateBatchComment = React.useCallback((index: number, comment: string) => {
        setBatchComments(prev => ({ ...prev, [index]: comment }));
    }, []);

    const updateLineComment = React.useCallback((id: number, comment: string) => {
        setSubtitles(prev => prev.map(s => s.id === id ? { ...s, comment } : s));
    }, []);

    const updateSubtitleText = React.useCallback((id: number, translated: string) => {
        setSubtitles(prev => prev.map(s => s.id === id ? { ...s, translated } : s));
    }, []);

    const updateSubtitleOriginal = React.useCallback((id: number, original: string) => {
        setSubtitles(prev => prev.map(s => s.id === id ? { ...s, original } : s));
    }, []);

    const updateSpeaker = React.useCallback((id: number, speaker: string) => {
        setSubtitles(prev => prev.map(s => s.id === id ? { ...s, speaker } : s));
    }, []);

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

    useEffect(() => {
        return () => {
            cleanup();
        };
    }, [cleanup]);

    return React.useMemo(() => ({
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
        handleSubtitleImport,
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
        resetWorkspace,
        cancelOperation
    }), [
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
        handleSubtitleImport,
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
        resetWorkspace,
        cancelOperation
    ]);
};
