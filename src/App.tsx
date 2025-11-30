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
import { createGlossary } from '@/services/glossary/manager';
import { migrateFromLegacyGlossary } from '@/services/glossary/migrator';
import { generateSubtitles } from '@/services/api/gemini/subtitle';
import { runBatchOperation } from '@/services/api/gemini/batch';
import { generateGlossary, retryGlossaryExtraction } from '@/services/api/gemini/glossary';

import { SmartSegmenter } from '@/services/audio/segmenter';
import { TerminologyChecker, TerminologyIssue } from './terminologyChecker';
import { GlossaryManager } from './GlossaryManager';
import { Header } from '@/components/layout/Header';
import { WorkspaceHeader } from '@/components/layout/WorkspaceHeader';
import { FileUploader } from '@/components/upload/FileUploader';
import { SubtitleEditor } from '@/components/editor/SubtitleEditor';
import { SettingsModal, GenreSettingsDialog, CustomSelect } from '@/components/settings';
import { SimpleConfirmationModal } from '@/components/modals';
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
        if (!confirm(`恢复到 ${snapshot.timestamp} 的版本？如果未保存，当前进度将丢失。`)) return;
        setSubtitles(JSON.parse(JSON.stringify(snapshot.subtitles)));
        setBatchComments({ ...snapshot.batchComments });
        setShowSnapshots(false);
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
            logger.info("File selected", { name: selectedFile.name, size: selectedFile.size, type: selectedFile.type });
            setFile(selectedFile);
            audioCacheRef.current = null;
            setError(null);
            if (activeTab === 'new' && subtitles.length > 0 && status === GenerationStatus.COMPLETED) {
                if (!confirm("这将替换当前文件，可能需要重新生成。继续吗？")) return;
                setSubtitles([]); setStatus(GenerationStatus.IDLE); setSnapshots([]); setBatchComments({});
            }
            try { const d = await getFileDuration(selectedFile); setDuration(d); } catch (e) { setDuration(0); }
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
        if (subtitles.length > 0 && !confirm("返回主页？未保存的进度将丢失。")) return;
        setView('home'); setSubtitles([]); setFile(null); setDuration(0); setStatus(GenerationStatus.IDLE); setSnapshots([]); setBatchComments({}); setSelectedBatches(new Set()); setError(null);
    };
    const startNewProject = () => { setActiveTab('new'); setView('workspace'); setSubtitles([]); setFile(null); setDuration(0); setStatus(GenerationStatus.IDLE); setSnapshots([]); setBatchComments({}); setSelectedBatches(new Set()); setError(null); };
    const startImportProject = () => { setActiveTab('import'); setView('workspace'); setSubtitles([]); setFile(null); setDuration(0); setStatus(GenerationStatus.IDLE); setSnapshots([]); setBatchComments({}); setSelectedBatches(new Set()); setError(null); };

    // --- Render Components ---


    const handleGenerateGlossary = async () => {
        if (subtitles.length === 0) {
            setError("没有可用的字幕进行分析。");
            return;
        }
        setIsGeneratingGlossary(true);
        try {
            const apiKey = settings.geminiKey || ENV_GEMINI_KEY;
            const terms = await generateGlossary(subtitles, apiKey, settings.genre, (settings.requestTimeout || 600) * 1000);

            // Merge with existing glossary to avoid duplicates
            const existingTerms = new Set(settings.glossary?.map(g => g.term.toLowerCase()) || []);
            const newTerms = terms.filter(t => !existingTerms.has(t.term.toLowerCase()));

            const updatedGlossary = [...(settings.glossary || []), ...newTerms];
            updateSetting('glossary', updatedGlossary);

            if (newTerms.length === 0) {
                logger.info("未发现新术语。");
            }
        } catch (e: any) {
            logger.error("Glossary generation failed", e);
            setError(e.message);
        } finally {
            setIsGeneratingGlossary(false);
        }
    };

    const handleExportGlossary = () => {
        if (!settings.glossary || settings.glossary.length === 0) return;
        const content = JSON.stringify(settings.glossary, null, 2);
        downloadFile('glossary.json', content, 'json');
    };

    // Confirmation Modal State
    const [confirmationModal, setConfirmationModal] = useState<{
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
        type: 'info'
    });

    const closeConfirmationModal = () => {
        setConfirmationModal(prev => ({ ...prev, isOpen: false }));
    };

    const handleImportGlossary = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const content = ev.target?.result as string;
                    const parsed = JSON.parse(content);
                    if (Array.isArray(parsed)) {
                        // Basic validation
                        const validItems = parsed.filter(item => item.term && item.translation);
                        if (validItems.length > 0) {
                            setConfirmationModal({
                                isOpen: true,
                                title: '导入术语表',
                                message: `导入 ${validItems.length} 个术语？这将合并到现有术语表中。`,
                                type: 'info',
                                onConfirm: () => {
                                    const existingTerms = new Set(settings.glossary?.map(g => g.term.toLowerCase()) || []);
                                    const newTerms = validItems.filter((t: GlossaryItem) => !existingTerms.has(t.term.toLowerCase()));
                                    const updatedGlossary = [...(settings.glossary || []), ...newTerms];
                                    updateSetting('glossary', updatedGlossary);
                                    addToast(`已导入 ${newTerms.length} 个新术语。`, 'success');
                                }
                            });
                        } else {
                            addToast("文件中未找到有效的术语表项。", 'warning');
                        }
                    } else {
                        addToast("无效的术语表文件格式。", 'error');
                    }
                } catch (err) {
                    console.error("Failed to parse glossary file", err);
                    addToast("解析术语表文件失败。", 'error');
                }
            };
            reader.readAsText(file);
            e.target.value = '';
        }
    };




    const GlossaryConfirmationModal = () => {
        const [selectedTerms, setSelectedTerms] = useState<Set<string>>(new Set());
        const [resolvedConflicts, setResolvedConflicts] = useState<Record<string, GlossaryItem | null>>({});
        const [customTerms, setCustomTerms] = useState<GlossaryItem[]>([]);
        const [editingId, setEditingId] = useState<string | null>(null);
        const [editValue, setEditValue] = useState<GlossaryItem | null>(null);
        const [overrides, setOverrides] = useState<Record<string, GlossaryItem>>({});

        const [conflictCustomValues, setConflictCustomValues] = useState<Record<string, GlossaryItem>>({});

        // Track if state has been initialized to prevent resets during editing
        const initialized = useRef(false);

        if (!glossaryConfirmCallback || pendingGlossaryResults.length === 0) {
            return null;
        }

        // Get active glossary terms
        const activeGlossary = settings.glossaries?.find(g => g.id === settings.activeGlossaryId);
        const activeTerms = activeGlossary?.terms || (activeGlossary as any)?.items || settings.glossary || [];

        // Memoize mergeGlossaryResults to prevent re-computing on every render
        const { unique, conflicts } = useMemo(() =>
            mergeGlossaryResults(pendingGlossaryResults, activeTerms),
            [pendingGlossaryResults, activeTerms]
        );

        // Initialize state ONLY on first mount, not on every render
        useEffect(() => {
            if (!initialized.current && pendingGlossaryResults.length > 0) {
                const newUnique = unique.filter(u => !activeTerms.some(g => g.term.toLowerCase() === u.term.toLowerCase()));
                setSelectedTerms(new Set(newUnique.map(t => t.term)));

                const initialResolved: Record<string, GlossaryItem | null> = {};
                conflicts.forEach(c => {
                    if (c.hasExisting) {
                        const existing = c.options.find(o => activeTerms.some(g => g.term === o.term && g.translation === o.translation));
                        if (existing) initialResolved[c.term] = existing;
                    }
                });
                setResolvedConflicts(initialResolved);

                initialized.current = true; // Mark as initialized
            }
        }, [pendingGlossaryResults, unique, conflicts, activeTerms]);



        const handleConfirm = () => {
            if (!glossaryConfirmCallback) return;
            const termsToAdd = unique.filter(t => selectedTerms.has(t.term)).map(t => overrides[t.term] || t);
            const resolvedToAdd = Object.values(resolvedConflicts).filter((t): t is GlossaryItem => t !== null);
            const newTerms = [...termsToAdd, ...resolvedToAdd, ...customTerms];

            if (settings.activeGlossaryId && settings.glossaries) {
                const updatedGlossaries = settings.glossaries.map(g => {
                    if (g.id === settings.activeGlossaryId) {
                        const uniqueMap = new Map<string, GlossaryItem>();
                        (g.terms || (g as any).items || []).forEach((item: GlossaryItem) => uniqueMap.set(item.term.toLowerCase(), item));
                        newTerms.forEach(item => uniqueMap.set(item.term.toLowerCase(), item));
                        return { ...g, terms: Array.from(uniqueMap.values()) };
                    }
                    return g;
                });
                updateSetting('glossaries', updatedGlossaries);
                const updatedActive = updatedGlossaries.find(g => g.id === settings.activeGlossaryId);
                glossaryConfirmCallback(updatedActive?.terms || []);
            } else {
                const finalGlossary = [...(settings.glossary || []), ...newTerms];
                const uniqueMap = new Map<string, GlossaryItem>();
                finalGlossary.forEach(item => uniqueMap.set(item.term.toLowerCase(), item));
                const deduplicated = Array.from(uniqueMap.values());

                updateSetting('glossary', deduplicated);
                glossaryConfirmCallback(deduplicated);
            }

            setGlossaryConfirmCallback(null);
            setPendingGlossaryResults([]);
            setCustomTerms([]);
            setResolvedConflicts({});
            setSelectedTerms(new Set());
            setOverrides({});
            setConflictCustomValues({});
        };

        const handleDiscard = () => {
            if (glossaryConfirmCallback) {
                glossaryConfirmCallback(activeTerms);
                setGlossaryConfirmCallback(null);
            }
            setPendingGlossaryResults([]);
            setCustomTerms([]);
            setResolvedConflicts({});
            setSelectedTerms(new Set());
            setOverrides({});
            setConflictCustomValues({});
        };

        const toggleTerm = (term: string) => {
            const newSelected = new Set(selectedTerms);
            if (newSelected.has(term)) newSelected.delete(term);
            else newSelected.add(term);
            setSelectedTerms(newSelected);

        };

        const startEditing = (item: GlossaryItem, id: string) => {
            setEditingId(id);
            setEditValue({ ...item });

            // If editing a conflict's custom translation, clear any discard state
            if (id.startsWith('conflict-custom-')) {
                const term = id.replace('conflict-custom-', '');
                setResolvedConflicts(prev => {
                    const newConflicts = { ...prev };
                    // Only clear if it was set to null (discard)
                    if (newConflicts[term] === null) {
                        delete newConflicts[term];
                    }
                    return newConflicts;
                });
            }


        };

        const saveEdit = (originalTerm: string) => {
            if (editValue) {
                if (editingId?.startsWith('custom-')) {
                    setCustomTerms(prev => prev.map(t => (t.term === originalTerm ? editValue : t)));
                } else if (editingId?.startsWith('conflict-custom-')) {
                    setConflictCustomValues(prev => ({ ...prev, [originalTerm]: editValue }));
                    setResolvedConflicts(prev => ({ ...prev, [originalTerm]: editValue }));
                } else {
                    setOverrides(prev => ({ ...prev, [originalTerm]: editValue }));
                }
            }
            setEditingId(null);
            setEditValue(null);

        };

        const addCustomTerm = () => {
            const newTerm: GlossaryItem = { term: 'New Term', translation: '', notes: '' };
            setCustomTerms([...customTerms, newTerm]);
            setTimeout(() => startEditing(newTerm, `custom-${Date.now()}`), 0);

        };

        const totalToAdd = selectedTerms.size + Object.values(resolvedConflicts).filter(v => v !== null).length + customTerms.length;

        return (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
                <div className="bg-slate-900 border border-indigo-500/30 rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[90vh]">
                    <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
                        <div>
                            <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                <Book className="w-5 h-5 text-indigo-400" />
                                确认术语表
                            </h3>
                            <p className="text-slate-400 text-sm mt-1">
                                在翻译前检查提取的术语。
                            </p>
                        </div>
                        <div className="flex items-center gap-4">
                            <button onClick={handleDiscard} className="text-slate-400 hover:text-white transition-colors">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">
                        {/* Conflicts Section */}
                        {conflicts.length > 0 && (
                            <div className="space-y-4">
                                <h3 className="text-sm font-bold text-amber-400 uppercase tracking-wider flex items-center"><AlertCircle className="w-4 h-4 mr-2" /> 冲突 ({conflicts.length})</h3>
                                <div className="grid gap-4">
                                    {conflicts.map((conflict, idx) => {
                                        const existingOption = conflict.options.find(o => settings.glossary?.some(g => g.term === o.term && g.translation === o.translation));
                                        const newOptions = conflict.options.filter(o => o !== existingOption);
                                        const customId = `conflict-custom-${conflict.term}`;
                                        const isCustomEditing = editingId === customId;
                                        const customValue = conflictCustomValues[conflict.term];
                                        const isCustomSelected = resolvedConflicts[conflict.term] === customValue;

                                        return (
                                            <div key={idx} className="bg-slate-800/50 border border-amber-500/20 rounded-xl p-4">
                                                <div className="flex items-center justify-between mb-3">
                                                    <span className="font-bold text-white text-lg">{conflict.term}</span>
                                                    <span className="text-xs text-amber-500 bg-amber-500/10 px-2 py-1 rounded-full border border-amber-500/20">多个翻译</span>
                                                </div>
                                                <div className="space-y-2">
                                                    {/* N: New Options */}
                                                    {newOptions.map((option, optIdx) => (
                                                        <div
                                                            key={optIdx}
                                                            onClick={() => {
                                                                setResolvedConflicts(prev => ({ ...prev, [conflict.term]: option }));

                                                            }}
                                                            className={`p-3 rounded-lg border cursor-pointer transition-all ${resolvedConflicts[conflict.term] === option
                                                                ? 'bg-indigo-500/20 border-indigo-500 ring-1 ring-indigo-500'
                                                                : 'bg-slate-800 border-slate-700 hover:border-slate-600'
                                                                }`}
                                                        >
                                                            <div className="flex items-center justify-between">
                                                                <div>
                                                                    <div className="font-medium text-white flex items-center gap-2">
                                                                        {option.translation}
                                                                    </div>
                                                                    {option.notes && <div className="text-sm text-slate-400 mt-1">{option.notes}</div>}
                                                                </div>
                                                                {resolvedConflicts[conflict.term] === option && <CheckCircle className="w-5 h-5 text-indigo-400" />}
                                                            </div>
                                                        </div>
                                                    ))}

                                                    {/* +1: Keep Current (if exists) */}
                                                    {existingOption && (
                                                        <div
                                                            onClick={() => {
                                                                setResolvedConflicts(prev => ({ ...prev, [conflict.term]: existingOption }));

                                                            }}
                                                            className={`p-3 rounded-lg border cursor-pointer transition-all ${resolvedConflicts[conflict.term] === existingOption
                                                                ? 'bg-indigo-500/20 border-indigo-500 ring-1 ring-indigo-500'
                                                                : 'bg-slate-800 border-slate-700 hover:border-slate-600'
                                                                }`}
                                                        >
                                                            <div className="flex items-center justify-between">
                                                                <div>
                                                                    <div className="font-medium text-white flex items-center gap-2">
                                                                        {existingOption.translation}
                                                                        <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded">保留当前</span>
                                                                    </div>
                                                                    {existingOption.notes && <div className="text-sm text-slate-400 mt-1">{existingOption.notes}</div>}
                                                                </div>
                                                                {resolvedConflicts[conflict.term] === existingOption && <CheckCircle className="w-5 h-5 text-indigo-400" />}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* +2: Custom Option */}
                                                    <div className={`p-3 rounded-lg border cursor-pointer transition-all ${isCustomSelected ? 'bg-indigo-500/20 border-indigo-500 ring-1 ring-indigo-500' : 'bg-slate-800 border-slate-700 hover:border-slate-600'}`}>
                                                        {isCustomEditing ? (
                                                            <div className="space-y-2">
                                                                <input
                                                                    value={editValue?.translation || ''}
                                                                    onChange={e => {
                                                                        setEditValue(prev => prev ? { ...prev, translation: e.target.value } : null);

                                                                    }}
                                                                    className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm text-white"
                                                                    placeholder="自定义翻译"
                                                                    autoFocus
                                                                    onClick={e => e.stopPropagation()}
                                                                />
                                                                <input
                                                                    value={editValue?.notes || ''}
                                                                    onChange={e => {
                                                                        setEditValue(prev => prev ? { ...prev, notes: e.target.value } : null);

                                                                    }}
                                                                    className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-slate-400"
                                                                    placeholder="备注 (可选)"
                                                                    onClick={e => e.stopPropagation()}
                                                                />
                                                                <div className="flex justify-end gap-2">
                                                                    <button onClick={(e) => { e.stopPropagation(); setEditingId(null); }} className="text-xs text-slate-400 hover:text-white">取消</button>
                                                                    <button onClick={(e) => { e.stopPropagation(); saveEdit(conflict.term); }} className="text-xs text-indigo-400 hover:text-indigo-300">保存</button>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div onClick={() => {
                                                                if (customValue) {
                                                                    setResolvedConflicts(prev => ({ ...prev, [conflict.term]: customValue }));

                                                                } else {
                                                                    startEditing({ term: conflict.term, translation: '', notes: '' }, customId);
                                                                }
                                                            }} className="flex items-center justify-between">
                                                                <div className="flex items-center gap-2">
                                                                    <Edit2 className="w-4 h-4 text-emerald-400" />
                                                                    <span className={customValue ? "text-white font-medium" : "text-slate-400 italic text-sm"}>
                                                                        {customValue ? customValue.translation : "编写自定义翻译..."}
                                                                    </span>
                                                                </div>
                                                                {customValue && (
                                                                    <div className="flex items-center gap-2">
                                                                        <button onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            startEditing(customValue, customId);
                                                                        }} className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white">
                                                                            <Edit2 className="w-3 h-3" />
                                                                        </button>
                                                                        {isCustomSelected && <CheckCircle className="w-5 h-5 text-indigo-400" />}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* +3: Discard (if no existing option, or always show) */}
                                                    {!existingOption && (
                                                        <div
                                                            onClick={() => {
                                                                setResolvedConflicts(prev => ({ ...prev, [conflict.term]: null }));

                                                            }}
                                                            className={`p-3 rounded-lg border cursor-pointer transition-all ${resolvedConflicts[conflict.term] === null
                                                                ? 'bg-red-500/10 border-red-500/50 text-red-400'
                                                                : 'bg-slate-800 border-slate-700 hover:border-slate-600 text-slate-400'
                                                                }`}
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                <X className="w-4 h-4" />
                                                                <span>丢弃术语</span>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* New Terms Section */}
                        {unique.length > 0 && (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-sm font-bold text-indigo-400 uppercase tracking-wider flex items-center"><Sparkles className="w-4 h-4 mr-2" /> 新术语 ({unique.length})</h3>
                                    <button
                                        onClick={() => {
                                            if (selectedTerms.size === unique.length) setSelectedTerms(new Set());
                                            else setSelectedTerms(new Set(unique.map(t => t.term)));

                                        }}
                                        className="text-xs text-indigo-400 hover:text-indigo-300"
                                    >
                                        {selectedTerms.size === unique.length ? '取消全选' : '全选'}
                                    </button>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {unique.map((term, idx) => {
                                        const isSelected = selectedTerms.has(term.term);
                                        const isEditing = editingId === term.term;
                                        const displayTerm = overrides[term.term] || term;

                                        return (
                                            <div
                                                key={idx}
                                                className={`p-3 rounded-xl border transition-all ${isSelected
                                                    ? 'bg-indigo-500/10 border-indigo-500/30'
                                                    : 'bg-slate-800/50 border-slate-700 opacity-60'
                                                    }`}
                                            >
                                                <div className="flex items-start gap-3">
                                                    <div className="pt-1">
                                                        <input
                                                            type="checkbox"
                                                            checked={isSelected}
                                                            onChange={() => toggleTerm(term.term)}
                                                            className="rounded border-slate-600 bg-slate-700 text-indigo-500 focus:ring-indigo-500/50"
                                                        />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        {isEditing ? (
                                                            <div className="space-y-2">
                                                                <input
                                                                    value={editValue?.term}
                                                                    onChange={e => {
                                                                        setEditValue(prev => prev ? { ...prev, term: e.target.value } : null);

                                                                    }}
                                                                    className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm text-white"
                                                                    placeholder="术语"
                                                                />
                                                                <input
                                                                    value={editValue?.translation}
                                                                    onChange={e => {
                                                                        setEditValue(prev => prev ? { ...prev, translation: e.target.value } : null);

                                                                    }}
                                                                    className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm text-white"
                                                                    placeholder="翻译"
                                                                />
                                                                <input
                                                                    value={editValue?.notes}
                                                                    onChange={e => {
                                                                        setEditValue(prev => prev ? { ...prev, notes: e.target.value } : null);

                                                                    }}
                                                                    className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-slate-400"
                                                                    placeholder="备注"
                                                                />
                                                                <div className="flex justify-end gap-2">
                                                                    <button onClick={() => setEditingId(null)} className="text-xs text-slate-400 hover:text-white">取消</button>
                                                                    <button onClick={() => saveEdit(term.term)} className="text-xs text-indigo-400 hover:text-indigo-300">保存</button>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="group relative">
                                                                <div className="flex items-center justify-between">
                                                                    <div className="font-medium text-white text-base truncate pr-2">{displayTerm.term}</div>
                                                                    <button
                                                                        onClick={() => startEditing(displayTerm, term.term)}
                                                                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-all"
                                                                    >
                                                                        <Edit2 className="w-3 h-3" />
                                                                    </button>
                                                                </div>
                                                                <div className="text-indigo-300 text-sm mt-0.5">{displayTerm.translation}</div>
                                                                {displayTerm.notes && <div className="text-slate-500 text-xs mt-1 italic">{displayTerm.notes}</div>}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Custom Terms Section */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-bold text-emerald-400 uppercase tracking-wider flex items-center"><Plus className="w-4 h-4 mr-2" /> 自定义术语 ({customTerms.length})</h3>
                                <button onClick={addCustomTerm} className="text-xs bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 px-2 py-1 rounded border border-emerald-500/20 transition-colors">
                                    + 添加术语
                                </button>
                            </div>
                            {customTerms.length > 0 && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {customTerms.map((term, idx) => {
                                        const id = `custom-${idx}`;
                                        const isEditing = editingId === id;

                                        return (
                                            <div key={idx} className="bg-slate-800/50 border border-emerald-500/20 rounded-xl p-3">
                                                {isEditing ? (
                                                    <div className="space-y-2">
                                                        <input
                                                            value={editValue?.term}
                                                            onChange={e => {
                                                                setEditValue(prev => prev ? { ...prev, term: e.target.value } : null);

                                                            }}
                                                            className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm text-white"
                                                            placeholder="术语"
                                                        />
                                                        <input
                                                            value={editValue?.translation}
                                                            onChange={e => {
                                                                setEditValue(prev => prev ? { ...prev, translation: e.target.value } : null);

                                                            }}
                                                            className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm text-white"
                                                            placeholder="翻译"
                                                        />
                                                        <input
                                                            value={editValue?.notes}
                                                            onChange={e => {
                                                                setEditValue(prev => prev ? { ...prev, notes: e.target.value } : null);

                                                            }}
                                                            className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-slate-400"
                                                            placeholder="备注"
                                                        />
                                                        <div className="flex justify-end gap-2">
                                                            <button
                                                                onClick={() => {
                                                                    setCustomTerms(prev => prev.filter((_, i) => i !== idx));
                                                                    setEditingId(null);
                                                                }}
                                                                className="text-xs text-red-400 hover:text-red-300"
                                                            >
                                                                删除
                                                            </button>
                                                            <button onClick={() => saveEdit(term.term)} className="text-xs text-emerald-400 hover:text-emerald-300">保存</button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="group relative">
                                                        <div className="flex items-center justify-between">
                                                            <div className="font-medium text-white text-base truncate pr-2">{term.term}</div>
                                                            <button
                                                                onClick={() => startEditing(term, id)}
                                                                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-all"
                                                            >
                                                                <Edit2 className="w-3 h-3" />
                                                            </button>
                                                        </div>
                                                        <div className="text-emerald-300 text-sm mt-0.5">{term.translation}</div>
                                                        {term.notes && <div className="text-slate-500 text-xs mt-1 italic">{term.notes}</div>}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="p-6 border-t border-slate-800 bg-slate-900/50 flex justify-between items-center">
                        <div className="flex items-center space-x-2">
                            <button onClick={handleDiscard} className="px-4 py-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">
                                全部丢弃
                            </button>
                        </div>
                        <div className="flex items-center space-x-4">
                            <div className="flex items-center space-x-2">
                                <span className="text-sm text-slate-400">添加到:</span>
                                <CustomSelect
                                    value={settings.activeGlossaryId || ''}
                                    onChange={(val) => updateSetting('activeGlossaryId', val || null)}
                                    options={settings.glossaries?.map(g => ({ value: g.id, label: g.name })) || []}
                                    className="w-48"
                                    placeholder="选择术语表"
                                />
                            </div>
                            <button onClick={handleConfirm} className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-lg font-medium shadow-lg shadow-indigo-500/25 transition-all flex items-center">
                                <CheckCircle className="w-4 h-4 mr-2" />
                                添加 {totalToAdd} 个术语
                            </button>
                        </div>
                    </div>
                </div>
            </div>

        );
    };

    const LogViewer = () => {
        if (!showLogs) return null;
        const logsEndRef = useRef<HTMLDivElement>(null);

        useEffect(() => {
            logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }, [logs]);

        return (
            <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl h-[80vh] flex flex-col shadow-2xl animate-fade-in relative overflow-hidden">
                    <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-900/95 backdrop-blur">
                        <h2 className="text-lg font-bold text-white flex items-center"><FileText className="w-5 h-5 mr-2 text-slate-400" /> Application Logs</h2>
                        <button onClick={() => setShowLogs(false)} className="text-slate-400 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-1 font-mono text-xs custom-scrollbar bg-slate-950">
                        {logs.map((log, idx) => (
                            <div key={idx} className={`flex gap-2 ${log.level === 'ERROR' ? 'text-red-400' : log.level === 'WARN' ? 'text-amber-400' : log.level === 'DEBUG' ? 'text-slate-500' : 'text-slate-300'}`}>
                                <span className="text-slate-600 shrink-0">[{log.timestamp}]</span>
                                <span className={`font-bold w-12 shrink-0 ${log.level === 'ERROR' ? 'bg-red-500/10' : log.level === 'WARN' ? 'bg-amber-500/10' : ''} text-center rounded`}>{log.level}</span>
                                <span className="break-all whitespace-pre-wrap">{log.message}</span>
                                {log.data && <pre className="text-[10px] text-slate-500 overflow-x-auto mt-1 ml-14">{JSON.stringify(log.data, null, 2)}</pre>}
                            </div>
                        ))}
                        <div ref={logsEndRef} />
                    </div>
                    <div className="p-3 border-t border-slate-800 bg-slate-900 flex justify-between items-center">
                        <span className="text-xs text-slate-500">{logs.length} entries</span>
                        <button onClick={() => { navigator.clipboard.writeText(JSON.stringify(logs, null, 2)); addToast("Logs copied to clipboard", "success"); }} className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded border border-slate-700 transition-colors">Copy to Clipboard</button>
                    </div>
                </div>
            </div>
        );
    };



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

    const GlossaryExtractionFailedDialog = () => {
        if (!showGlossaryFailure || !glossaryConfirmCallback) return null;

        const handleContinue = () => {
            if (glossaryConfirmCallback) {
                glossaryConfirmCallback(settings.glossary || []);
                setGlossaryConfirmCallback(null);
            }
            setShowGlossaryFailure(false);
            setGlossaryMetadata(null);
        };

        return (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
                <div className="bg-slate-900 border border-red-500/30 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
                    <div className="p-6 text-center space-y-4">
                        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto">
                            <AlertCircle className="w-8 h-8 text-red-500" />
                        </div>
                        <h3 className="text-xl font-bold text-white">术语提取失败</h3>
                        <p className="text-slate-400 text-sm">
                            无法从音频中提取术语。这可能是由于 API 错误或音频不清晰。
                        </p>
                        <div className="flex flex-col space-y-2 pt-4">
                            <button onClick={handleRetryGlossary} disabled={isGeneratingGlossary} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2 rounded-lg transition-colors flex items-center justify-center">
                                {isGeneratingGlossary ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCcw className="w-4 h-4 mr-2" />}
                                {isGeneratingGlossary ? '正在重试...' : '重试提取'}
                            </button>
                            <button onClick={handleContinue} disabled={isGeneratingGlossary} className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium py-2 rounded-lg transition-colors">
                                跳过 (继续而不使用新术语)
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
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
                            <StatusBadge />
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
            <GlossaryConfirmationModal />
            <GlossaryExtractionFailedDialog />
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
            <ProgressOverlay />
            <ToastContainer toasts={toasts} removeToast={removeToast} />
        </>
    );
}
