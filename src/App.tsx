import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Upload, FileVideo, Download, Trash2, Play, CheckCircle, AlertCircle, Languages, Loader2, Sparkles, Settings, X, Eye, EyeOff, MessageSquareText, AudioLines, Clapperboard, Monitor, CheckSquare, Square, RefreshCcw, Type, Clock, Wand2, FileText, RotateCcw, MessageCircle, GitCommit, ArrowLeft, Plus, Book, ShieldCheck, Scissors, Pencil, Cpu, Layout, Search, Globe, Zap, Volume2, ChevronDown, ChevronRight, Save, Edit2, Ban } from 'lucide-react';
import { SubtitleItem, SubtitleSnapshot, OutputFormat, BatchOperationMode } from '@/types/subtitle';
import { AppSettings, GENRE_PRESETS } from '@/types/settings';
import { GlossaryItem, GlossaryExtractionResult, GlossaryExtractionMetadata } from '@/types/glossary';
import { GenerationStatus, ChunkStatus } from '@/types/api';
import { generateSrtContent, generateAssContent } from '@/services/subtitle/generator';
import { downloadFile } from '@/services/subtitle/downloader';
import { parseSrt, parseAss } from '@/services/subtitle/parser';
import { decodeAudio } from '@/services/audio/decoder';
import { logger, LogEntry } from '@/services/utils/logger';
import { mergeGlossaryResults } from '@/services/glossary/merger';

import { migrateFromLegacyGlossary } from '@/services/glossary/migrator';
import { generateSubtitles } from '@/services/api/gemini/subtitle';
import { runBatchOperation } from '@/services/api/gemini/batch';
import { retryGlossaryExtraction } from '@/services/api/gemini/glossary';

import { SmartSegmenter } from '@/services/audio/segmenter';
import { TerminologyChecker, TerminologyIssue } from './terminologyChecker';
import { GlossaryManager } from './GlossaryManager';
import { Header } from '@/components/layout/Header';
import { WorkspaceHeader } from '@/components/layout/WorkspaceHeader';
import { FileUploader } from '@/components/upload/FileUploader';
import { SubtitleEditor } from '@/components/editor/SubtitleEditor';
import { SettingsModal, GenreSettingsDialog, CustomSelect } from '@/components/settings';
import { GlossaryExtractionFailedDialog, GlossaryConfirmationModal, SimpleConfirmationModal } from '@/components/modals';
import { ToastContainer, TimeTracker, StatusBadge, ProgressOverlay } from '@/components/ui';
import type { ToastMessage } from '@/components/ui';


const SETTINGS_KEY = 'gemini_subtitle_settings';

const ENV_GEMINI_KEY = (window as any).env?.GEMINI_API_KEY || process.env.API_KEY || process.env.GEMINI_API_KEY || '';
const ENV_OPENAI_KEY = (window as any).env?.OPENAI_API_KEY || process.env.OPENAI_API_KEY || '';

const DEFAULT_SETTINGS: AppSettings = {
    geminiKey: '',
    openaiKey: '',
    transcriptionModel: 'whisper-1',
    genre: 'general',
    customTranslationPrompt: '',
    customProofreadingPrompt: '',
    outputMode: 'bilingual',
    proofreadBatchSize: 20,
    translationBatchSize: 20,
    chunkDuration: 300,
    concurrencyFlash: 5,
    concurrencyPro: 2,

    enableAutoGlossary: true,
    glossarySampleMinutes: 'all',
    glossaryAutoConfirm: false,
    useSmartSplit: true,
    glossaries: [],
    activeGlossaryId: null,
    requestTimeout: 600
};
















export default function App() {
    // View State
    const [view, setView] = useState<'home' | 'workspace'>('home');

    // Logic State
    const [activeTab, setActiveTab] = useState<'new' | 'import'>('new');
    const [settingsTab, setSettingsTab] = useState('general');

    const [file, setFile] = useState<File | null>(null);
    const [duration, setDuration] = useState<number>(0);
    const [status, setStatus] = useState<GenerationStatus>(GenerationStatus.IDLE);
    const [progressMsg, setProgressMsg] = useState('');
    const [chunkProgress, setChunkProgress] = useState<Record<string, ChunkStatus>>({});
    const [subtitles, setSubtitles] = useState<SubtitleItem[]>([]);
    const [snapshots, setSnapshots] = useState<SubtitleSnapshot[]>([]);

    const [showSnapshots, setShowSnapshots] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [showGenreSettings, setShowGenreSettings] = useState(false);
    const [showGlossaryManager, setShowGlossaryManager] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Settings State
    const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
    const [isSettingsLoaded, setIsSettingsLoaded] = useState(false);

    // Batch Selection & Comment State
    const [selectedBatches, setSelectedBatches] = useState<Set<number>>(new Set());
    const [batchComments, setBatchComments] = useState<Record<number, string>>({});

    // View State
    const [showSourceText, setShowSourceText] = useState(true);
    const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
    const [startTime, setStartTime] = useState<number | null>(null);

    // Toast State
    const [toasts, setToasts] = useState<ToastMessage[]>([]);

    const addToast = (message: string, type: 'info' | 'warning' | 'error' | 'success' = 'info') => {
        const id = Date.now().toString() + Math.random().toString();
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => removeToast(id), 5000);
    };

    const removeToast = (id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    };

    const handleProgress = (update: ChunkStatus) => {
        setChunkProgress(prev => ({ ...prev, [update.id]: update }));
        if (update.message) setProgressMsg(update.message);
        if (update.toast) {
            addToast(update.toast.message, update.toast.type);
        }
    };

    // Phase 4 State
    const [glossary, setGlossary] = useState<GlossaryItem[]>([]);
    const [termIssues, setTermIssues] = useState<TerminologyIssue[]>([]);
    const [isGeneratingGlossary, setIsGeneratingGlossary] = useState(false);
    const [showGlossaryConfirmation, setShowGlossaryConfirmation] = useState(false);
    const [pendingGlossaryResults, setPendingGlossaryResults] = useState<GlossaryExtractionResult[]>([]);
    const [glossaryMetadata, setGlossaryMetadata] = useState<GlossaryExtractionMetadata | null>(null);
    const [showGlossaryFailure, setShowGlossaryFailure] = useState(false);
    const [glossaryConfirmCallback, setGlossaryConfirmCallback] = useState<((glossary: GlossaryItem[]) => void) | null>(null);

    // Confirmation Modal State
    const [confirmation, setConfirmation] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        onConfirm: () => void;
        type?: 'info' | 'warning' | 'danger';
    }>({
        isOpen: false,
        title: '',
        message: '',
        onConfirm: () => { },
        type: 'warning'
    });

    const showConfirm = (title: string, message: string, onConfirm: () => void, type: 'info' | 'warning' | 'danger' = 'warning') => {
        setConfirmation({ isOpen: true, title, message, onConfirm, type });
    };

    // Logs State
    const [showLogs, setShowLogs] = useState(false);
    const [logs, setLogs] = useState<LogEntry[]>([]);

    useEffect(() => {
        setLogs(logger.getLogs());
        const unsubscribe = logger.subscribe((log) => {
            setLogs(prev => [...prev, log]);
        });
        return unsubscribe;
    }, []);

    // Refs
    const subtitleListRef = useRef<HTMLDivElement>(null);
    const audioCacheRef = useRef<{ file: File, buffer: AudioBuffer } | null>(null);

    const isProcessing = status === GenerationStatus.UPLOADING || status === GenerationStatus.PROCESSING || status === GenerationStatus.PROOFREADING;

    const isCustomGenre = !GENRE_PRESETS.includes(settings.genre);

    // --- Initialization ---
    useEffect(() => {
        const storedSettings = localStorage.getItem(SETTINGS_KEY);
        if (storedSettings) {
            try {
                const parsed = JSON.parse(storedSettings);
                let newSettings = { ...DEFAULT_SETTINGS, ...parsed };

                // Migration: Legacy glossary to Multi-Glossary
                if (parsed.glossary && parsed.glossary.length > 0 && (!parsed.glossaries || parsed.glossaries.length === 0)) {
                    const defaultGlossary = migrateFromLegacyGlossary(parsed.glossary);
                    newSettings.glossaries = [defaultGlossary];
                    newSettings.activeGlossaryId = defaultGlossary.id;
                    logger.info('Migrated legacy glossary to new format');
                }

                // Ensure glossaries array exists and fix malformed data
                if (!newSettings.glossaries) {
                    newSettings.glossaries = [];
                } else {
                    // Fix potential migration issues (items vs terms)
                    newSettings.glossaries = newSettings.glossaries.map((g: any) => ({
                        ...g,
                        terms: g.terms || g.items || []
                    }));
                }

                setSettings(newSettings);
            } catch (e) { logger.warn("Settings load error", e); }
        }
        setIsSettingsLoaded(true);
    }, []);

    useEffect(() => {
        if (!isSettingsLoaded) return;
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    }, [settings, isSettingsLoaded]);

    useEffect(() => {
        if (status === GenerationStatus.PROCESSING && subtitleListRef.current) {
            subtitleListRef.current.scrollTop = subtitleListRef.current.scrollHeight;
        }
    }, [subtitles, status]);

    // --- Helpers ---
    const getFileDuration = (f: File): Promise<number> => {
        return new Promise((resolve) => {
            const element = f.type.startsWith('audio') ? new Audio() : document.createElement('video');
            element.preload = 'metadata';
            const url = URL.createObjectURL(f);
            element.src = url;
            element.onloadedmetadata = () => { resolve(element.duration); URL.revokeObjectURL(url); };
            element.onerror = () => { resolve(0); URL.revokeObjectURL(url); };
        });
    };

    const createSnapshot = (description: string, subtitlesOverride?: SubtitleItem[]) => {
        const newSnapshot: SubtitleSnapshot = {
            id: Date.now().toString(),
            timestamp: new Date().toLocaleTimeString(),
            description,
            subtitles: JSON.parse(JSON.stringify(subtitlesOverride || subtitles)),
            batchComments: { ...batchComments }
        };
        setSnapshots(prev => [newSnapshot, ...prev].slice(0, 20));
    };

    const restoreSnapshot = (snapshot: SubtitleSnapshot) => {
        showConfirm(
            "恢复快照",
            `确定要恢复到 ${snapshot.timestamp} 的版本吗？当前未保存的进度将丢失。`,
            () => {
                setSubtitles(JSON.parse(JSON.stringify(snapshot.subtitles)));
                setBatchComments({ ...snapshot.batchComments });
                setShowSnapshots(false);
            },
            'warning'
        );
    };

    const toggleBatch = (index: number) => {
        const newSet = new Set(selectedBatches);
        if (newSet.has(index)) newSet.delete(index);
        else newSet.add(index);
        setSelectedBatches(newSet);
    };

    const toggleAllBatches = (totalBatches: number) => {
        if (selectedBatches.size === totalBatches) setSelectedBatches(new Set());
        else setSelectedBatches(new Set(Array.from({ length: totalBatches }, (_, i) => i)));
    };

    const selectBatchesWithComments = (chunks: SubtitleItem[][]) => {
        const newSet = new Set<number>();
        chunks.forEach((chunk, idx) => {
            const hasBatchComment = batchComments[idx] && batchComments[idx].trim().length > 0;
            const hasLineComments = chunk.some(s => s.comment && s.comment.trim().length > 0);
            if (hasBatchComment || hasLineComments) newSet.add(idx);
        });
        setSelectedBatches(newSet);
    };



    // --- Handlers ---
    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
                    "替换文件",
                    "这将替换当前文件，可能需要重新生成。继续吗？",
                    () => {
                        setSubtitles([]); setStatus(GenerationStatus.IDLE); setSnapshots([]); setBatchComments({});
                        processFile();
                    },
                    'warning'
                );
            } else {
                processFile();
            }
        }
    };

    const handleSubtitleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const subFile = e.target.files[0];
            logger.info("Subtitle file imported", { name: subFile.name });
            const reader = new FileReader();
            reader.onload = (ev) => {
                const content = ev.target?.result as string;
                let parsed: SubtitleItem[] = [];
                if (subFile.name.endsWith('.ass')) parsed = parseAss(content);
                else parsed = parseSrt(content);
                setSubtitles(parsed);
                setStatus(GenerationStatus.COMPLETED);
                if (subtitles.length === 0) { setSnapshots([]); setBatchComments({}); }
                else { setSnapshots([]); setBatchComments({}); }
                createSnapshot("初始导入", parsed);
            };
            reader.readAsText(subFile);
        }
    };

    const handleGenerate = async () => {
        if (!file) { setError("请先上传媒体文件。"); return; }
        if ((!settings.geminiKey && !ENV_GEMINI_KEY) || (!settings.openaiKey && !ENV_OPENAI_KEY)) {
            setError("缺少 API 密钥。请在设置中配置。"); setShowSettings(true); return;
        }
        setStatus(GenerationStatus.UPLOADING); setError(null); setSubtitles([]); setSnapshots([]); setBatchComments({}); setSelectedBatches(new Set()); setChunkProgress({}); setStartTime(Date.now());
        logger.info("Starting subtitle generation", { file: file.name, duration, settings: { ...settings, geminiKey: '***', openaiKey: '***' } });
        try {
            setStatus(GenerationStatus.PROCESSING);

            // Prepare runtime settings with active glossary terms
            const activeGlossary = settings.glossaries?.find(g => g.id === settings.activeGlossaryId);
            const runtimeSettings = {
                ...settings,
                glossary: activeGlossary?.terms || settings.glossary || []
            };

            const { subtitles: result, glossaryResults } = await generateSubtitles(
                file,
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
                            const existingTerms = new Set(activeTerms.map(g => g.term.toLowerCase()));
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
                    return new Promise<GlossaryItem[]>((resolve) => {
                        logger.info("Setting up UI for manual glossary confirmation...");
                        setGlossaryMetadata(metadata);

                        // Store the resolve function
                        setGlossaryConfirmCallback(() => (confirmedItems: GlossaryItem[]) => {
                            logger.info("User confirmed glossary terms:", confirmedItems.length);
                            // Settings are already updated by GlossaryConfirmationModal

                            // Cleanup UI
                            setShowGlossaryConfirmation(false);
                            setShowGlossaryFailure(false);
                            setPendingGlossaryResults([]);
                            setGlossaryMetadata(null);
                            setGlossaryConfirmCallback(null);

                            resolve(confirmedItems);
                        });

                        if (metadata.totalTerms > 0) {
                            setPendingGlossaryResults(metadata.results);
                            setShowGlossaryConfirmation(true);
                        } else if (metadata.hasFailures) {
                            setShowGlossaryFailure(true);
                        } else {
                            // Should not happen if gemini.ts logic is correct, but safe fallback
                            if (settings.activeGlossaryId && settings.glossaries) {
                                const activeG = settings.glossaries.find(g => g.id === settings.activeGlossaryId);
                                resolve(activeG?.terms || []);
                            } else {
                                resolve(settings.glossary || []);
                            }
                        }
                    });
                }
            );

            // Then check subtitle results
            if (result.length === 0) throw new Error("No subtitles were generated.");

            setSubtitles(result);
            setStatus(GenerationStatus.COMPLETED);
            createSnapshot("初始生成", result);

            logger.info("Subtitle generation completed", { count: result.length });
            addToast("字幕生成成功！", "success");
        } catch (err: any) {
            setStatus(GenerationStatus.ERROR);
            setError(err.message);
            logger.error("Subtitle generation failed", err);
            addToast(`生成失败: ${err.message}`, "error");
        }
    };

    const handleBatchAction = async (mode: BatchOperationMode, singleIndex?: number) => {
        const indices: number[] = singleIndex !== undefined ? [singleIndex] : Array.from(selectedBatches) as number[];
        if (indices.length === 0) return;
        if (!settings.geminiKey && !ENV_GEMINI_KEY) { setError("缺少 API 密钥。"); return; }
        if (mode === 'fix_timestamps' && !file) { setError("没有源媒体文件无法修复时间轴。"); return; }
        setStatus(GenerationStatus.PROOFREADING); setError(null); setChunkProgress({}); setStartTime(Date.now());
        logger.info(`Starting batch action: ${mode}`, { indices, mode });
        try {
            const refined = await runBatchOperation(file, subtitles, indices, settings, mode, batchComments, handleProgress);
            setSubtitles(refined); setStatus(GenerationStatus.COMPLETED);
            setBatchComments(prev => { const next = { ...prev }; indices.forEach(idx => delete next[idx]); return next; });
            if (singleIndex === undefined) setSelectedBatches(new Set());
            const actionName = mode === 'fix_timestamps' ? '修复时间轴' : '校对';
            createSnapshot(`${actionName} (${indices.length} 个片段)`, refined);
            logger.info(`Batch action ${mode} completed`);
            addToast(`批量操作 '${actionName}' 成功完成！`, "success");
        } catch (err: any) {
            setStatus(GenerationStatus.ERROR);
            setError(`操作失败: ${err.message}`);
            logger.error(`Batch action ${mode} failed`, err);
            addToast(`批量操作失败: ${err.message}`, "error");
        }
    };



    const updateSetting = (key: keyof AppSettings, value: any) => {
        setSettings(prev => {
            const newSettings = { ...prev, [key]: value };
            return newSettings;
        });
    };

    const handleDownload = (format: 'srt' | 'ass') => {
        if (subtitles.length === 0) return;
        const isBilingual = settings.outputMode === 'bilingual';
        const content = format === 'srt'
            ? generateSrtContent(subtitles, isBilingual)
            : generateAssContent(subtitles, file ? file.name : "video", isBilingual);
        const filename = file ? file.name.replace(/\.[^/.]+$/, "") : "subtitles";
        logger.info(`Downloading subtitles: ${filename}.${format}`);
        downloadFile(`${filename}.${format}`, content, format);
    };

    const updateBatchComment = (index: number, comment: string) => {
        setBatchComments(prev => ({ ...prev, [index]: comment }));
    };

    const updateLineComment = (id: number, comment: string) => {
        setSubtitles(prev => prev.map(s => s.id === id ? { ...s, comment } : s));
    };

    const goBackHome = () => {
        const doGoBack = () => {
            setView('home'); setSubtitles([]); setFile(null); setDuration(0); setStatus(GenerationStatus.IDLE); setSnapshots([]); setBatchComments({}); setSelectedBatches(new Set()); setError(null);
        };

        if (subtitles.length > 0) {
            showConfirm(
                "返回主页",
                "返回主页？未保存的进度将丢失。",
                doGoBack,
                'warning'
            );
        } else {
            doGoBack();
        }
    };
    const startNewProject = () => { setActiveTab('new'); setView('workspace'); setSubtitles([]); setFile(null); setDuration(0); setStatus(GenerationStatus.IDLE); setSnapshots([]); setBatchComments({}); setSelectedBatches(new Set()); setError(null); };
    const startImportProject = () => { setActiveTab('import'); setView('workspace'); setSubtitles([]); setFile(null); setDuration(0); setStatus(GenerationStatus.IDLE); setSnapshots([]); setBatchComments({}); setSelectedBatches(new Set()); setError(null); };

    // --- Render Components ---











    const renderLogViewer = () => {
        if (!showLogs) return null;

        return (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl animate-fade-in relative">
                    <div className="p-6 border-b border-slate-800 flex items-center justify-between">
                        <h2 className="text-xl font-bold text-white flex items-center">
                            <FileText className="w-5 h-5 mr-2 text-blue-400" /> 应用日志
                        </h2>
                        <button onClick={() => setShowLogs(false)} className="text-slate-400 hover:text-white transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                        {logs.length === 0 ? (
                            <div className="text-center text-slate-500 py-12">
                                <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                                <p>暂无日志</p>
                            </div>
                        ) : (
                            <div className="space-y-2 font-mono text-sm">
                                {logs.map((log, idx) => (
                                    <div key={idx} className={`p-3 rounded-lg border ${log.level === 'ERROR' ? 'bg-red-500/10 border-red-500/30 text-red-300' :
                                        log.level === 'WARN' ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' :
                                            log.level === 'INFO' ? 'bg-blue-500/10 border-blue-500/30 text-blue-300' :
                                                'bg-slate-800/50 border-slate-700 text-slate-400'
                                        }`}>
                                        <div className="flex items-start gap-3">
                                            <span className="text-xs opacity-70 whitespace-nowrap">{log.timestamp}</span>
                                            <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${log.level === 'ERROR' ? 'bg-red-500 text-white' :
                                                log.level === 'WARN' ? 'bg-amber-500 text-white' :
                                                    log.level === 'INFO' ? 'bg-blue-500 text-white' :
                                                        'bg-slate-600 text-slate-200'
                                                }`}>{log.level}</span>
                                            <span className="flex-1">{log.message}</span>
                                        </div>
                                        {log.data && (
                                            <pre className="mt-2 text-xs opacity-80 overflow-x-auto">{JSON.stringify(log.data, null, 2)}</pre>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };


    const handleRetryGlossary = async () => {
        if (!glossaryMetadata?.glossaryChunks || !audioCacheRef.current) return;

        setIsGeneratingGlossary(true);
        try {
            const apiKey = settings.geminiKey || ENV_GEMINI_KEY;
            const newMetadata = await retryGlossaryExtraction(
                apiKey,
                audioCacheRef.current.buffer,
                glossaryMetadata.glossaryChunks,
                settings.genre,
                settings.concurrencyPro,
                settings.geminiEndpoint,
                (settings.requestTimeout || 600) * 1000
            );

            setGlossaryMetadata(newMetadata);
            if (newMetadata.totalTerms > 0 || newMetadata.hasFailures) {
                if (newMetadata.totalTerms > 0) {
                    setPendingGlossaryResults(newMetadata.results);
                    setShowGlossaryConfirmation(true);
                    setShowGlossaryFailure(false);
                } else {
                    setShowGlossaryFailure(true); // Still failed
                }
            } else {
                // Empty results, no failure
                if (glossaryConfirmCallback) {
                    glossaryConfirmCallback(settings.glossary || []);
                    setGlossaryConfirmCallback(null);
                }
                setShowGlossaryFailure(false);
                setGlossaryMetadata(null);
            }

        } catch (e) {
            logger.error("Retry failed", e);
            setError("Retry failed: " + (e as Error).message);
        } finally {
            setIsGeneratingGlossary(false);
        }
    };



    const renderHome = () => (
        <div className="min-h-screen bg-slate-950 flex flex-col p-4 md:p-8">
            <div className="max-w-7xl mx-auto w-full flex-1 flex flex-col">
                <Header
                    onShowLogs={() => setShowLogs(true)}
                    onShowGlossary={() => setShowGlossaryManager(true)}
                    onShowSettings={() => setShowSettings(true)}
                />
                <main className="flex-1 flex flex-col items-center justify-center max-w-4xl mx-auto w-full">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full">
                        <button onClick={startNewProject} className="group relative bg-slate-900 border border-slate-800 hover:border-indigo-500/50 hover:bg-slate-800/50 rounded-3xl p-8 transition-all duration-300 shadow-2xl flex flex-col items-center text-center cursor-pointer">
                            <div className="w-20 h-20 bg-slate-800 group-hover:bg-indigo-500/20 rounded-2xl flex items-center justify-center mb-6 transition-colors"><FileVideo className="w-10 h-10 text-indigo-400 group-hover:scale-110 transition-transform" /></div>
                            <h2 className="text-2xl font-bold text-white mb-3">新建项目</h2><p className="text-slate-400 leading-relaxed">使用 Whisper 和 Gemini 从视频/音频转录并翻译。</p>
                        </button>
                        <button onClick={startImportProject} className="group relative bg-slate-900 border border-slate-800 hover:border-emerald-500/50 hover:bg-slate-800/50 rounded-3xl p-8 transition-all duration-300 shadow-2xl flex flex-col items-center text-center cursor-pointer">
                            <div className="w-20 h-20 bg-slate-800 group-hover:bg-emerald-500/20 rounded-2xl flex items-center justify-center mb-6 transition-colors"><FileText className="w-10 h-10 text-emerald-400 group-hover:scale-110 transition-transform" /></div>
                            <h2 className="text-2xl font-bold text-white mb-3">打开字幕</h2><p className="text-slate-400 leading-relaxed mb-4">导入现有的 .SRT 或 .ASS 文件以修复时间轴、校对或重新翻译。</p>
                            <div className="flex flex-wrap gap-2 justify-center mt-2"><span className="text-xs px-2 py-1 bg-slate-800 rounded border border-slate-700 text-slate-500">编辑文本</span><span className="text-xs px-2 py-1 bg-slate-800 rounded border border-slate-700 text-slate-500">+ 视频参考</span></div>
                        </button>
                    </div>
                </main>
                <footer className="mt-12 text-center text-slate-600 text-sm">Gemini Subtitle Pro v1.2</footer>
            </div>
        </div>
    );

    const renderWorkspace = () => (
        <div className="min-h-screen bg-slate-950 text-slate-200 p-4 md:p-8 flex flex-col">
            <div className="max-w-7xl mx-auto w-full flex-1 flex flex-col space-y-6">
                <WorkspaceHeader
                    title={activeTab === 'new' ? '新建项目' : '字幕编辑器'}
                    modeLabel={activeTab === 'new' ? '生成模式' : '导入模式'}
                    subtitleInfo={file ? file.name : (subtitles.length > 0 ? `${subtitles.length} 行已加载` : '未选择文件')}
                    onBack={goBackHome}
                    showSnapshots={showSnapshots}
                    onToggleSnapshots={() => setShowSnapshots(!showSnapshots)}
                    hasSnapshots={snapshots.length > 0}
                    onShowLogs={() => setShowLogs(true)}
                    onShowGlossary={() => setShowGlossaryManager(true)}
                    onShowSettings={() => setShowSettings(true)}
                />
                <div className="flex-1 flex flex-col lg:grid lg:grid-cols-12 gap-6 min-h-0">
                    <div className="lg:col-span-3 lg:h-full overflow-y-auto custom-scrollbar space-y-4">
                        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 shadow-sm space-y-4">
                            <div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-slate-300">项目文件</h3></div>
                            {file ? (
                                <FileUploader
                                    hasFile={true}
                                    fileName={file.name}
                                    fileInfo={`${Math.floor(duration / 60)}:${Math.floor(duration % 60).toString().padStart(2, '0')} · ${(file.size / (1024 * 1024)).toFixed(1)}MB`}
                                    onFileSelect={handleFileChange}
                                    disabled={isProcessing}
                                    accept="video/*,audio/*"
                                    icon={<FileVideo className="text-indigo-400" />}
                                    uploadTitle="" // Not used when hasFile is true
                                />
                            ) : (
                                <FileUploader
                                    hasFile={false}
                                    onFileSelect={handleFileChange}
                                    accept="video/*,audio/*"
                                    icon={activeTab === 'new' ? <Upload className="text-indigo-400" /> : <Plus className="text-slate-500 group-hover:text-indigo-400" />}
                                    uploadTitle={activeTab === 'new' ? "上传视频 / 音频" : "附加媒体 (可选)"}
                                    uploadDescription={activeTab === 'new' ? "开始转录" : undefined}
                                    heightClass={activeTab === 'new' ? 'h-32' : 'h-20'}
                                />
                            )}
                            {activeTab === 'import' && (
                                <div className="pt-2 border-t border-slate-800">
                                    <div className="flex items-center justify-between mb-2"><h3 className="text-xs font-semibold text-slate-400">字幕文件</h3>{subtitles.length > 0 && (<span className="text-[10px] text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded">{subtitles.length} 行</span>)}</div>
                                    {subtitles.length === 0 ? (
                                        <FileUploader
                                            hasFile={false}
                                            onFileSelect={handleSubtitleImport}
                                            accept=".srt,.ass"
                                            icon={<FileText className="text-emerald-500 group-hover:text-emerald-400" />}
                                            uploadTitle="导入 .SRT / .ASS"
                                            heightClass="h-24"
                                        />
                                    ) : (
                                        <FileUploader
                                            hasFile={true}
                                            fileInfo="字幕已加载"
                                            onFileSelect={handleSubtitleImport}
                                            accept=".srt,.ass"
                                            icon={<FileText className="text-emerald-500" />}
                                            uploadTitle=""
                                        />
                                    )}
                                </div>
                            )}
                            <div className="flex flex-col space-y-3 text-xs text-slate-400 bg-slate-800/50 p-3 rounded-lg border border-slate-700/50">


                                <div className="flex items-center justify-between">
                                    <span className="flex items-center text-slate-500"><Clapperboard className="w-3 h-3 mr-2" /> 类型</span>
                                    <button onClick={() => setShowGenreSettings(true)} className="flex items-center space-x-1.5 px-2 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-xs font-medium text-slate-300 hover:text-white transition-colors group" title="编辑类型 / 上下文">
                                        <span className="truncate max-w-[100px]">
                                            {settings.genre === 'general' ? '通用' :
                                                settings.genre === 'anime' ? '动漫' :
                                                    settings.genre === 'movie' ? '电影' :
                                                        settings.genre === 'news' ? '新闻' :
                                                            settings.genre === 'tech' ? '科技' : settings.genre}
                                        </span>
                                        <Edit2 className="w-3 h-3 text-slate-500 group-hover:text-indigo-400 transition-colors" />
                                    </button>
                                </div>

                                <div className="flex flex-col space-y-1 pt-2 border-t border-slate-700/50">
                                    <span className="flex items-center text-slate-500 mb-1"><Book className="w-3 h-3 mr-2" /> 术语表</span>
                                    <CustomSelect
                                        value={settings.activeGlossaryId || ''}
                                        onChange={(val) => updateSetting('activeGlossaryId', val || null)}
                                        options={[
                                            { value: '', label: '(无)' },
                                            ...(settings.glossaries?.map(g => ({
                                                value: g.id,
                                                label: (
                                                    <div className="flex items-center justify-between w-full min-w-0">
                                                        <span className="truncate mr-2">{g.name}</span>
                                                        <span className="text-slate-500 text-xs flex-shrink-0">({g.terms?.length || 0})</span>
                                                    </div>
                                                )
                                            })) || [])
                                        ]}
                                        className="w-full"
                                        placeholder="(无)"
                                    />
                                </div>
                            </div>
                        </div>
                        {activeTab === 'new' && (
                            <button onClick={handleGenerate} disabled={isProcessing || !file} className={`w-full py-3 px-4 rounded-xl font-semibold text-white shadow-lg transition-all flex items-center justify-center space-x-2 ${isProcessing || !file ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700' : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 shadow-indigo-500/25 hover:shadow-indigo-500/40 cursor-pointer'}`}>
                                {isProcessing ? (<Loader2 className="w-5 h-5 animate-spin" />) : (<Play className="w-5 h-5 fill-current" />)}
                                <span>{status === GenerationStatus.IDLE || status === GenerationStatus.COMPLETED || status === GenerationStatus.ERROR ? '开始处理' : '处理中...'}</span>
                            </button>
                        )}
                        {error && (<div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400 flex items-start space-x-2 animate-fade-in"><AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /><span className="break-words w-full">{error}</span></div>)}
                        {(status === GenerationStatus.COMPLETED || status === GenerationStatus.PROOFREADING) && subtitles.length > 0 && (
                            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 shadow-sm animate-fade-in">
                                <h3 className="text-sm font-semibold text-white mb-3 flex items-center"><Download className="w-4 h-4 mr-2 text-emerald-400" /> 导出</h3>
                                <div className="grid grid-cols-2 gap-2">
                                    <button onClick={() => handleDownload('srt')} className="flex flex-col items-center justify-center p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 rounded-lg transition-all"><span className="font-bold text-slate-200 text-sm">.SRT</span></button>
                                    <button onClick={() => handleDownload('ass')} className="flex flex-col items-center justify-center p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 rounded-lg transition-all"><span className="font-bold text-slate-200 text-sm">.ASS</span></button>
                                </div>
                                <div className="mt-3 text-[12px] text-center text-slate-500">模式: {settings.outputMode === 'bilingual' ? '双语' : '仅翻译'}</div>
                            </div>
                        )}
                    </div>

                    <div className="lg:col-span-9 flex flex-col h-[500px] lg:h-full min-h-0">
                        <div className="flex items-center justify-between mb-2 h-8 shrink-0">
                            <div className="flex items-center space-x-2">

                            </div>
                            <StatusBadge status={status} />
                        </div>
                        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden flex flex-col shadow-2xl relative flex-1 min-h-0">
                            {showSnapshots ? (
                                <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar w-full relative">
                                    <button onClick={() => setShowSnapshots(false)} className="absolute top-2 right-4 text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
                                    {snapshots.length === 0 ? (<div className="h-full flex flex-col items-center justify-center text-slate-500 opacity-50"><GitCommit className="w-12 h-12 mb-2" /><p>本次会话无可用版本</p></div>) : (snapshots.map((snap) => (<div key={snap.id} className="bg-slate-800/50 border border-slate-700 p-4 rounded-xl flex justify-between items-center"><div><h4 className="font-medium text-slate-200">{snap.description}</h4><p className="text-xs text-slate-500 mt-1">{snap.timestamp}</p></div><button onClick={() => restoreSnapshot(snap)} className="px-3 py-1.5 bg-slate-700 hover:bg-indigo-600 rounded text-xs text-white transition-colors flex items-center"><RotateCcw className="w-3 h-3 mr-1" /> 恢复</button></div>)))}
                                </div>
                            ) : (
                                <div className="flex-1 overflow-y-auto custom-scrollbar relative w-full h-full max-h-[calc(100vh-220px)]" ref={subtitleListRef}>
                                    <SubtitleEditor
                                        subtitles={subtitles}
                                        settings={settings}
                                        status={status}
                                        activeTab={activeTab}
                                        selectedBatches={selectedBatches}
                                        toggleAllBatches={toggleAllBatches}
                                        selectBatchesWithComments={selectBatchesWithComments}
                                        showSourceText={showSourceText}
                                        setShowSourceText={setShowSourceText}
                                        file={file}
                                        handleBatchAction={handleBatchAction}
                                        batchComments={batchComments}
                                        toggleBatch={toggleBatch}
                                        updateBatchComment={updateBatchComment}
                                        editingCommentId={editingCommentId}
                                        setEditingCommentId={setEditingCommentId}
                                        updateLineComment={updateLineComment}
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );

    return (
        <>
            <GlossaryConfirmationModal
                isOpen={showGlossaryConfirmation}
                pendingResults={pendingGlossaryResults}
                settings={settings}
                onConfirm={(items) => glossaryConfirmCallback?.(items)}
                onUpdateSetting={updateSetting}
            />
            <GlossaryExtractionFailedDialog
                isOpen={showGlossaryFailure}
                isGeneratingGlossary={isGeneratingGlossary}
                glossaryConfirmCallback={glossaryConfirmCallback}
                settings={settings}
                onRetry={handleRetryGlossary}
                onContinue={() => {
                    setShowGlossaryFailure(false);
                    if (glossaryConfirmCallback) {
                        glossaryConfirmCallback(settings.glossary || []);
                        setGlossaryConfirmCallback(null);
                    }
                }}
            />
            <SettingsModal
                isOpen={showSettings}
                onClose={() => setShowSettings(false)}
                activeTab={settingsTab}
                setActiveTab={setSettingsTab}
                settings={settings}
                updateSetting={updateSetting}
                envGeminiKey={ENV_GEMINI_KEY}
                envOpenaiKey={ENV_OPENAI_KEY}
                onOpenGlossaryManager={() => {
                    setShowSettings(false);
                    setShowGlossaryManager(true);
                }}
            />
            {showGlossaryManager && (
                <GlossaryManager
                    glossaries={settings.glossaries || []}
                    activeGlossaryId={settings.activeGlossaryId || null}
                    onUpdateGlossaries={(updated) => updateSetting('glossaries', updated)}
                    onSetActiveGlossary={(id) => updateSetting('activeGlossaryId', id)}
                    onClose={() => setShowGlossaryManager(false)}
                />
            )}
            {showLogs && renderLogViewer()}
            {view === 'home' && renderHome()}
            {view === 'workspace' && renderWorkspace()}
            <GenreSettingsDialog
                isOpen={showGenreSettings}
                onClose={() => setShowGenreSettings(false)}
                currentGenre={settings.genre}
                onSave={(genre) => updateSetting('genre', genre)}
            />
            <ProgressOverlay
                isProcessing={isProcessing}
                chunkProgress={chunkProgress}
                status={status}
                startTime={startTime || 0}
            />
            <ToastContainer toasts={toasts} removeToast={removeToast} />
            <SimpleConfirmationModal
                isOpen={confirmation.isOpen}
                onClose={() => setConfirmation(prev => ({ ...prev, isOpen: false }))}
                onConfirm={confirmation.onConfirm}
                title={confirmation.title}
                message={confirmation.message}
                type={confirmation.type}
            />
        </>
    );
}
