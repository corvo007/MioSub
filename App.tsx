import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Upload, FileVideo, Download, Trash2, Play, CheckCircle, AlertCircle, Languages, Loader2, Sparkles, Settings, X, Eye, EyeOff, MessageSquareText, AudioLines, Clapperboard, Monitor, CheckSquare, Square, RefreshCcw, Type, Clock, Wand2, FileText, RotateCcw, MessageCircle, GitCommit, ArrowLeft, Plus, Book, ShieldCheck, Scissors, Pencil, Cpu, Layout, Search, Globe, Zap, Volume2, ChevronDown, ChevronRight, Save, Edit2, Ban } from 'lucide-react';
import { SubtitleItem, GenerationStatus, OutputFormat, AppSettings, Genre, BatchOperationMode, SubtitleSnapshot, ChunkStatus, GENRE_PRESETS, GlossaryItem, GlossaryExtractionResult, GlossaryExtractionMetadata } from './types';
import { generateSrtContent, generateAssContent, downloadFile, parseSrt, parseAss, decodeAudio, logger, LogEntry } from './utils';
import { mergeGlossaryResults } from './glossaryUtils';
import { generateSubtitles, runBatchOperation, generateGlossary, retryGlossaryExtraction } from './gemini';

import { SmartSegmenter } from './smartSegmentation';
import { TerminologyChecker, TerminologyIssue } from './terminologyChecker';


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
    useSmartSplit: true
};




interface ToastMessage {
    id: string;
    message: string;
    type: 'info' | 'warning' | 'error' | 'success';
}

const ToastContainer = ({ toasts, removeToast }: { toasts: ToastMessage[], removeToast: (id: string) => void }) => {
    return (
        <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
            {toasts.map(toast => (
                <div key={toast.id} className={`
          pointer-events-auto flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium animate-fade-in
          ${toast.type === 'error' ? 'bg-red-500/90 text-white' :
                        toast.type === 'warning' ? 'bg-amber-500/90 text-white' :
                            toast.type === 'success' ? 'bg-emerald-500/90 text-white' :
                                'bg-slate-800/90 text-slate-200 border border-slate-700'}
        `}>
                    {toast.type === 'error' && <AlertCircle className="w-4 h-4" />}
                    {toast.type === 'warning' && <AlertCircle className="w-4 h-4" />}
                    {toast.type === 'success' && <CheckCircle className="w-4 h-4" />}
                    {toast.type === 'info' && <MessageSquareText className="w-4 h-4" />}
                    <span>{toast.message}</span>
                    <button onClick={() => removeToast(toast.id)} className="ml-2 opacity-70 hover:opacity-100">
                        <X className="w-3 h-3" />
                    </button>
                </div>
            ))}
        </div>
    );
};

const TimeTracker = ({ startTime, completed, total, status }: { startTime: number, completed: number, total: number, status: GenerationStatus }) => {
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, []);

    if (!startTime) return null;

    const elapsed = Math.floor((now - startTime) / 1000);

    return (
        <div className="flex justify-between text-xs text-slate-400 mb-4 px-1">
            <span>Time Used: {elapsed}s</span>
        </div>
    );
};

export default function App() {
    // View State
    const [view, setView] = useState<'home' | 'workspace'>('home');

    // Logic State
    const [activeTab, setActiveTab] = useState<'new' | 'import'>('new');
    const [settingsTab, setSettingsTab] = useState('api');

    const [file, setFile] = useState<File | null>(null);
    const [duration, setDuration] = useState<number>(0);
    const [status, setStatus] = useState<GenerationStatus>(GenerationStatus.IDLE);
    const [progressMsg, setProgressMsg] = useState('');
    const [chunkProgress, setChunkProgress] = useState<Record<string, ChunkStatus>>({});
    const [subtitles, setSubtitles] = useState<SubtitleItem[]>([]);
    const [snapshots, setSnapshots] = useState<SubtitleSnapshot[]>([]);

    const [showSnapshots, setShowSnapshots] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
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

                // Migration: Fix legacy model names


                setSettings(prev => ({ ...DEFAULT_SETTINGS, ...parsed }));
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
        if (!confirm(`Restore to version from ${snapshot.timestamp}? Current progress will be lost if not saved.`)) return;
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
                if (!confirm("This will replace the current file and may require re-generation. Continue?")) return;
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
                createSnapshot("Initial Import", parsed);
            };
            reader.readAsText(subFile);
        }
    };

    const handleGenerate = async () => {
        if (!file) { setError("Please upload a media file first."); return; }
        if ((!settings.geminiKey && !ENV_GEMINI_KEY) || (!settings.openaiKey && !ENV_OPENAI_KEY)) {
            setError("API Keys are missing. Please configure them in Settings."); setShowSettings(true); return;
        }
        setStatus(GenerationStatus.UPLOADING); setError(null); setSubtitles([]); setSnapshots([]); setBatchComments({}); setSelectedBatches(new Set()); setChunkProgress({}); setStartTime(Date.now());
        logger.info("Starting subtitle generation", { file: file.name, duration, settings: { ...settings, geminiKey: '***', openaiKey: '***' } });
        try {
            setStatus(GenerationStatus.PROCESSING);

            const { subtitles: result, glossaryResults } = await generateSubtitles(
                file,
                duration,
                settings,
                handleProgress,
                (newSubs) => setSubtitles(newSubs),
                // onGlossaryReady callback (Blocking)
                async (metadata: GlossaryExtractionMetadata) => {
                    logger.info("onGlossaryReady called with metadata:", metadata);

                    if (settings.glossaryAutoConfirm && !metadata.hasFailures) {
                        const { unique } = mergeGlossaryResults(metadata.results);
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

                    // Manual confirmation required
                    return new Promise<GlossaryItem[]>((resolve) => {
                        logger.info("Setting up UI for manual glossary confirmation...");
                        setGlossaryMetadata(metadata);

                        // Store the resolve function
                        setGlossaryConfirmCallback(() => (confirmedItems: GlossaryItem[]) => {
                            logger.info("User confirmed glossary terms:", confirmedItems.length);
                            const newGlossary = [...(settings.glossary || []), ...confirmedItems];
                            updateSetting('glossary', newGlossary);

                            // Cleanup UI
                            setShowGlossaryConfirmation(false);
                            setShowGlossaryFailure(false);
                            setPendingGlossaryResults([]);
                            setGlossaryMetadata(null);
                            setGlossaryConfirmCallback(null);

                            resolve(newGlossary);
                        });

                        if (metadata.totalTerms > 0) {
                            setPendingGlossaryResults(metadata.results);
                            setShowGlossaryConfirmation(true);
                        } else if (metadata.hasFailures) {
                            setShowGlossaryFailure(true);
                        } else {
                            // Should not happen if gemini.ts logic is correct, but safe fallback
                            resolve(settings.glossary || []);
                        }
                    });
                }
            );

            // Then check subtitle results
            if (result.length === 0) throw new Error("No subtitles were generated.");

            setSubtitles(result);
            setStatus(GenerationStatus.COMPLETED);
            createSnapshot("Initial Generation", result);

            logger.info("Subtitle generation completed", { count: result.length });
            addToast("Subtitle generation completed successfully!", "success");
        } catch (err: any) {
            setStatus(GenerationStatus.ERROR);
            setError(err.message);
            logger.error("Subtitle generation failed", err);
            addToast(`Generation failed: ${err.message}`, "error");
        }
    };

    const handleBatchAction = async (mode: BatchOperationMode, singleIndex?: number) => {
        const indices: number[] = singleIndex !== undefined ? [singleIndex] : Array.from(selectedBatches) as number[];
        if (indices.length === 0) return;
        if (!settings.geminiKey && !ENV_GEMINI_KEY) { setError("Missing API Key."); return; }
        if (mode === 'fix_timestamps' && !file) { setError("Cannot fix timestamps without source media file."); return; }
        setStatus(GenerationStatus.PROOFREADING); setError(null); setChunkProgress({}); setStartTime(Date.now());
        logger.info(`Starting batch action: ${mode}`, { indices, mode });
        try {
            const refined = await runBatchOperation(file, subtitles, indices, settings, mode, batchComments, handleProgress);
            setSubtitles(refined); setStatus(GenerationStatus.COMPLETED);
            setBatchComments(prev => { const next = { ...prev }; indices.forEach(idx => delete next[idx]); return next; });
            if (singleIndex === undefined) setSelectedBatches(new Set());
            const actionName = mode === 'fix_timestamps' ? 'Fix Time' : 'Proofread';
            createSnapshot(`${actionName} (${indices.length} segments)`, refined);
            logger.info(`Batch action ${mode} completed`);
            addToast(`Batch action '${actionName}' completed successfully!`, "success");
        } catch (err: any) {
            setStatus(GenerationStatus.ERROR);
            setError(`Action failed: ${err.message}`);
            logger.error(`Batch action ${mode} failed`, err);
            addToast(`Batch action failed: ${err.message}`, "error");
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
        if (subtitles.length > 0 && !confirm("Go back to home? Unsaved progress will be lost.")) return;
        setView('home'); setSubtitles([]); setFile(null); setDuration(0); setStatus(GenerationStatus.IDLE); setSnapshots([]); setBatchComments({}); setSelectedBatches(new Set()); setError(null);
    };
    const startNewProject = () => { setActiveTab('new'); setView('workspace'); setSubtitles([]); setFile(null); setDuration(0); setStatus(GenerationStatus.IDLE); setSnapshots([]); setBatchComments({}); setSelectedBatches(new Set()); setError(null); };
    const startImportProject = () => { setActiveTab('import'); setView('workspace'); setSubtitles([]); setFile(null); setDuration(0); setStatus(GenerationStatus.IDLE); setSnapshots([]); setBatchComments({}); setSelectedBatches(new Set()); setError(null); };

    // --- Render Components ---
    const ProgressOverlay = () => {
        if (!isProcessing) return null;

        const chunks = (Object.values(chunkProgress) as ChunkStatus[]).sort((a, b) => {
            // Prioritize system tasks
            const systemOrder = { 'decoding': 1, 'segmenting': 2, 'glossary': 3 };
            const orderA = systemOrder[a.id as keyof typeof systemOrder] || 999;
            const orderB = systemOrder[b.id as keyof typeof systemOrder] || 999;

            if (orderA !== orderB) return orderA - orderB;

            const idA = Number(a.id);
            const idB = Number(b.id);
            if (!isNaN(idA) && !isNaN(idB)) return idA - idB;
            return String(a.id).localeCompare(String(b.id));
        });

        const contentChunks = chunks.filter(c => !['init', 'decoding', 'segmenting', 'glossary'].includes(String(c.id)));
        const total = contentChunks.length > 0 ? contentChunks[0].total : 0;
        const completed = contentChunks.filter(c => c.status === 'completed').length;
        const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

        return (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
                <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-[600px] max-h-[80vh] flex flex-col shadow-2xl animate-in fade-in zoom-in duration-200">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-bold text-white flex items-center">
                            {status === GenerationStatus.PROOFREADING ? <Sparkles className="w-5 h-5 mr-2 text-purple-400 animate-pulse" /> : <Loader2 className="w-5 h-5 mr-2 text-blue-400 animate-spin" />}
                            {status === GenerationStatus.PROOFREADING ? 'Batch Processing...' : 'Generating Subtitles...'}
                        </h3>
                        <span className="text-2xl font-mono font-bold text-slate-200">{percent}%</span>
                    </div>

                    {startTime && (
                        <TimeTracker
                            startTime={startTime}
                            completed={completed}
                            total={total}
                            status={status}
                        />
                    )}

                    <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar bg-slate-950/50 p-4 rounded-lg border border-slate-800">
                        {chunks.length === 0 && <div className="text-center text-slate-500 py-8">Initializing...</div>}
                        {chunks.map(chunk => (
                            <div key={chunk.id} className="flex items-center justify-between bg-slate-800/80 p-3 rounded-lg border border-slate-700/50 hover:border-slate-600 transition-colors">
                                <div className="flex items-center space-x-3 min-w-[120px]">
                                    <div className={`w-2 h-2 rounded-full ${chunk.status === 'completed' ? 'bg-emerald-500' : chunk.status === 'error' ? 'bg-red-500' : 'bg-blue-500 animate-pulse'}`} />
                                    <span className="text-slate-300 font-mono text-sm font-medium">{typeof chunk.id === 'number' ? `Chunk ${chunk.id}` : chunk.id}</span>
                                </div>
                                <div className="flex-1 flex items-center justify-end space-x-4">
                                    <span className="text-xs font-medium text-slate-400">
                                        {chunk.message || chunk.status}
                                    </span>
                                    {chunk.status === 'processing' && <Loader2 className="w-3 h-3 animate-spin text-slate-500" />}
                                    {chunk.status === 'completed' && <CheckCircle className="w-3 h-3 text-emerald-500" />}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="mt-6">
                        <div className="flex justify-between text-xs text-slate-400 mb-2 font-medium">
                            <span>Progress</span>
                            <span>{completed}/{total} Completed</span>
                        </div>
                        <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden border border-slate-700/50">
                            <div className={`h-full transition-all duration-500 ease-out ${status === GenerationStatus.PROOFREADING ? 'bg-purple-500' : 'bg-blue-500'}`} style={{ width: `${percent}%` }}></div>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const StatusBadge = () => {
        switch (status) {
            case GenerationStatus.COMPLETED: return (<div className="flex items-center space-x-2 text-emerald-400 bg-emerald-400/10 px-4 py-2 rounded-full border border-emerald-500/20"><CheckCircle className="w-4 h-4" /><span className="text-sm font-medium">Complete</span></div>);
            case GenerationStatus.ERROR: return (<div className="flex items-center space-x-2 text-red-400 bg-red-400/10 px-4 py-2 rounded-full border border-red-500/20"><AlertCircle className="w-4 h-4" /><span className="text-sm font-medium">Error</span></div>);
            default: return null;
        }
    };

    const renderSubtitleList = () => {
        const chunks: SubtitleItem[][] = [];
        const batchSize = settings.proofreadBatchSize || 20;
        for (let i = 0; i < subtitles.length; i += batchSize) {
            chunks.push(subtitles.slice(i, i + batchSize));
        }

        if (chunks.length === 0) {
            return (
                <div className="h-full flex flex-col items-center justify-center text-slate-600 p-8 min-h-[300px]">
                    <div className="w-16 h-16 border-2 border-slate-700 border-dashed rounded-full flex items-center justify-center mb-4"><Languages className="w-6 h-6" /></div>
                    <p className="font-medium">No subtitles generated yet</p>
                    <p className="text-sm mt-2 max-w-xs text-center opacity-70">{activeTab === 'new' ? 'Upload a media file to start.' : 'Import an SRT/ASS file to begin editing.'}</p>
                </div>
            );
        }

        return (
            <div className="p-4 space-y-6 pb-20">
                {status === GenerationStatus.COMPLETED && (
                    <div className="flex flex-wrap items-center gap-3 bg-slate-800/90 p-3 rounded-lg border border-slate-700 sticky top-0 z-20 backdrop-blur-md shadow-md justify-between">
                        <div className="flex items-center space-x-4">
                            <button onClick={() => toggleAllBatches(chunks.length)} className="flex items-center space-x-2 text-sm text-slate-300 hover:text-white transition-colors">
                                {selectedBatches.size === chunks.length ? <CheckSquare className="w-4 h-4 text-indigo-400" /> : <Square className="w-4 h-4 text-slate-500" />}
                                <span>{selectedBatches.size === chunks.length ? 'Deselect All' : 'Select All'}</span>
                            </button>
                            <button onClick={() => selectBatchesWithComments(chunks)} className="flex items-center space-x-2 text-sm text-slate-300 hover:text-white transition-colors" title="Select segments with active comments">
                                <MessageCircle className="w-4 h-4 text-amber-400" /><span className="hidden sm:inline">Select Commented</span>
                            </button>
                            <button onClick={() => setShowSourceText(!showSourceText)} className="flex items-center space-x-2 text-sm text-slate-400 hover:text-white transition-colors">
                                {showSourceText ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}<span className="hidden sm:inline">{showSourceText ? "Hide Original" : "Show Original"}</span>
                            </button>
                        </div>
                        <div className="flex items-center space-x-2">
                            <div className="text-xs text-slate-500 font-mono mr-2 hidden sm:block">{selectedBatches.size} Selected</div>
                            {file && (
                                <button onClick={() => handleBatchAction('fix_timestamps')} disabled={selectedBatches.size === 0} title="Fix Timestamps (Preserves Translation)" className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all shadow-sm border ${selectedBatches.size > 0 ? 'bg-slate-700 border-slate-600 text-emerald-400 hover:bg-slate-600 hover:border-emerald-400/50' : 'bg-slate-800 border-slate-800 text-slate-600 cursor-not-allowed'}`}>
                                    <Clock className="w-3 h-3" /><span className="hidden sm:inline">Fix Time</span>
                                </button>
                            )}

                            <button onClick={() => handleBatchAction('proofread')} disabled={selectedBatches.size === 0} title="Proofread Translation (Preserves Timestamps)" className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all shadow-sm border ${selectedBatches.size > 0 ? 'bg-indigo-600 border-indigo-500 text-white hover:bg-indigo-500' : 'bg-slate-800 border-slate-800 text-slate-600 cursor-not-allowed'}`}>
                                <Sparkles className="w-3 h-3" /><span className="hidden sm:inline">Proofread</span>
                            </button>
                        </div>
                    </div>
                )}

                {chunks.map((chunk, chunkIdx) => {
                    const isSelected = selectedBatches.has(chunkIdx);
                    const startTime = chunk[0].startTime.split(',')[0];
                    const endTime = chunk[chunk.length - 1].endTime.split(',')[0];
                    const chunkComment = batchComments[chunkIdx] || '';

                    return (
                        <div key={chunkIdx} className={`border rounded-xl overflow-hidden transition-all ${isSelected ? 'border-indigo-500/50 bg-indigo-500/5' : 'border-slate-700/50 bg-slate-900/40'}`}>
                            <div className={`px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${isSelected ? 'bg-indigo-900/20' : 'bg-slate-800/50'}`}>
                                <div className="flex items-center space-x-3">
                                    {status === GenerationStatus.COMPLETED && (
                                        <button onClick={() => toggleBatch(chunkIdx)} className="text-slate-400 hover:text-indigo-400 focus:outline-none">
                                            {isSelected ? <CheckSquare className="w-5 h-5 text-indigo-400" /> : <Square className="w-5 h-5" />}
                                        </button>
                                    )}
                                    <div>
                                        <h3 className={`text-sm font-semibold ${isSelected ? 'text-indigo-300' : 'text-slate-300'}`}>Segment {chunkIdx + 1}</h3>
                                        <p className="text-xs text-slate-500 font-mono mt-0.5">{startTime} - {endTime}</p>
                                    </div>
                                </div>
                                <div className="flex-1 px-2">
                                    <input type="text" value={chunkComment} onChange={(e) => updateBatchComment(chunkIdx, e.target.value)} placeholder="Add instruction for this whole segment..." className="w-full bg-slate-900/50 border border-slate-700/50 rounded px-2 py-1 text-xs text-amber-200 placeholder-slate-600 focus:border-amber-500/50 focus:outline-none" />
                                </div>
                                {status === GenerationStatus.COMPLETED && (
                                    <div className="flex items-center space-x-1">
                                        <button onClick={() => handleBatchAction('proofread', chunkIdx)} title="Deep Proofread" className="p-2 text-slate-500 hover:text-indigo-400 hover:bg-slate-700 rounded-lg transition-colors"><Wand2 className="w-4 h-4" /></button>
                                    </div>
                                )}
                            </div>
                            <div className="divide-y divide-slate-800/50">
                                {chunk.map((sub) => (
                                    <div key={sub.id} className="p-3 hover:bg-slate-800/30 transition-colors flex items-start space-x-4 group/row">
                                        <div className="flex flex-col text-sm font-mono text-slate-400 min-w-[85px] pt-1">
                                            <span className="leading-tight">{(sub.startTime || '').split(',')[0]}</span>
                                            <span className="leading-tight opacity-70">{(sub.endTime || '').split(',')[0]}</span>
                                        </div>
                                        <div className="flex-1 space-y-1">
                                            {showSourceText && <p className="text-sm text-slate-400 leading-relaxed opacity-70 mb-1">{sub.original}</p>}
                                            <p className="text-lg text-indigo-300 leading-relaxed font-medium">{sub.translated}</p>
                                            {(editingCommentId === sub.id || sub.comment) && (
                                                <div className="mt-2 flex items-start animate-fade-in">
                                                    <MessageCircle className="w-3 h-3 text-amber-500 mt-1 mr-2 flex-shrink-0" />
                                                    <input type="text" value={sub.comment || ''} onChange={(e) => updateLineComment(sub.id, e.target.value)} placeholder="Add specific correction instruction..." autoFocus={editingCommentId === sub.id} onBlur={() => setEditingCommentId(null)} className="w-full bg-amber-500/10 border border-amber-500/20 rounded px-2 py-1 text-sm text-amber-200 placeholder-amber-500/50 focus:outline-none focus:border-amber-500/50" />
                                                </div>
                                            )}
                                        </div>
                                        <button onClick={() => setEditingCommentId(sub.id)} className={`p-1.5 rounded hover:bg-slate-700 transition-colors ${sub.comment ? 'text-amber-400' : 'text-slate-600 opacity-0 group-hover/row:opacity-100'}`} title="Add Comment/Correction"><MessageCircle className="w-4 h-4" /></button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    const handleGenerateGlossary = async () => {
        if (subtitles.length === 0) {
            setError("No subtitles available to analyze.");
            return;
        }
        setIsGeneratingGlossary(true);
        try {
            const apiKey = settings.geminiKey || ENV_GEMINI_KEY;
            const terms = await generateGlossary(subtitles, apiKey, settings.genre);

            // Merge with existing glossary to avoid duplicates
            const existingTerms = new Set(settings.glossary?.map(g => g.term.toLowerCase()) || []);
            const newTerms = terms.filter(t => !existingTerms.has(t.term.toLowerCase()));

            const updatedGlossary = [...(settings.glossary || []), ...newTerms];
            updateSetting('glossary', updatedGlossary);

            if (newTerms.length === 0) {
                logger.info("No new terms found.");
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
                            if (confirm(`Import ${validItems.length} terms? This will merge with your existing glossary.`)) {
                                const existingTerms = new Set(settings.glossary?.map(g => g.term.toLowerCase()) || []);
                                const newTerms = validItems.filter((t: GlossaryItem) => !existingTerms.has(t.term.toLowerCase()));
                                const updatedGlossary = [...(settings.glossary || []), ...newTerms];
                                updateSetting('glossary', updatedGlossary);
                                alert(`Imported ${newTerms.length} new terms.`);
                            }
                        } else {
                            alert("No valid glossary items found in file.");
                        }
                    } else {
                        alert("Invalid glossary file format.");
                    }
                } catch (err) {
                    console.error("Failed to parse glossary file", err);
                    alert("Failed to parse glossary file.");
                }
            };
            reader.readAsText(file);
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

        // Memoize mergeGlossaryResults to prevent re-computing on every render
        const { unique, conflicts } = useMemo(() =>
            mergeGlossaryResults(pendingGlossaryResults, settings.glossary),
            [pendingGlossaryResults, settings.glossary]
        );

        // Initialize state ONLY on first mount, not on every render
        useEffect(() => {
            if (!initialized.current && pendingGlossaryResults.length > 0) {
                const newUnique = unique.filter(u => !settings.glossary?.some(g => g.term.toLowerCase() === u.term.toLowerCase()));
                setSelectedTerms(new Set(newUnique.map(t => t.term)));

                const initialResolved: Record<string, GlossaryItem | null> = {};
                conflicts.forEach(c => {
                    if (c.hasExisting) {
                        const existing = c.options.find(o => settings.glossary?.some(g => g.term === o.term && g.translation === o.translation));
                        if (existing) initialResolved[c.term] = existing;
                    }
                });
                setResolvedConflicts(initialResolved);

                initialized.current = true; // Mark as initialized
            }
        }, [pendingGlossaryResults, unique, conflicts, settings.glossary]);



        const handleConfirm = () => {
            if (!glossaryConfirmCallback) return;
            const termsToAdd = unique.filter(t => selectedTerms.has(t.term)).map(t => overrides[t.term] || t);
            const resolvedToAdd = Object.values(resolvedConflicts).filter((t): t is GlossaryItem => t !== null);
            const finalGlossary = [...(settings.glossary || []), ...termsToAdd, ...resolvedToAdd, ...customTerms];
            const uniqueMap = new Map<string, GlossaryItem>();
            finalGlossary.forEach(item => uniqueMap.set(item.term.toLowerCase(), item));
            const deduplicated = Array.from(uniqueMap.values());

            updateSetting('glossary', deduplicated);
            glossaryConfirmCallback(deduplicated);
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
                glossaryConfirmCallback(settings.glossary || []);
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
                                Confirm Glossary Terms
                            </h3>
                            <p className="text-slate-400 text-sm mt-1">
                                Review extracted terms before they are used for translation.
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
                                <h3 className="text-sm font-bold text-amber-400 uppercase tracking-wider flex items-center"><AlertCircle className="w-4 h-4 mr-2" /> Conflicts ({conflicts.length})</h3>
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
                                                    <span className="text-xs text-amber-500 bg-amber-500/10 px-2 py-1 rounded-full border border-amber-500/20">Multiple Translations</span>
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
                                                                        <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded">Keep Current</span>
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
                                                                    placeholder="Custom Translation"
                                                                    autoFocus
                                                                    onClick={e => e.stopPropagation()}
                                                                />
                                                                <input
                                                                    value={editValue?.notes || ''}
                                                                    onChange={e => {
                                                                        setEditValue(prev => prev ? { ...prev, notes: e.target.value } : null);

                                                                    }}
                                                                    className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-slate-400"
                                                                    placeholder="Notes (Optional)"
                                                                    onClick={e => e.stopPropagation()}
                                                                />
                                                                <div className="flex justify-end gap-2">
                                                                    <button onClick={(e) => { e.stopPropagation(); setEditingId(null); }} className="text-xs text-slate-400 hover:text-white">Cancel</button>
                                                                    <button onClick={(e) => { e.stopPropagation(); saveEdit(conflict.term); }} className="text-xs text-indigo-400 hover:text-indigo-300">Save</button>
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
                                                                        {customValue ? customValue.translation : "Write Custom Translation..."}
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
                                                                <span>Discard Term</span>
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
                                    <h3 className="text-sm font-bold text-indigo-400 uppercase tracking-wider flex items-center"><Sparkles className="w-4 h-4 mr-2" /> New Terms ({unique.length})</h3>
                                    <button
                                        onClick={() => {
                                            if (selectedTerms.size === unique.length) setSelectedTerms(new Set());
                                            else setSelectedTerms(new Set(unique.map(t => t.term)));

                                        }}
                                        className="text-xs text-indigo-400 hover:text-indigo-300"
                                    >
                                        {selectedTerms.size === unique.length ? 'Deselect All' : 'Select All'}
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
                                                                    placeholder="Term"
                                                                />
                                                                <input
                                                                    value={editValue?.translation}
                                                                    onChange={e => {
                                                                        setEditValue(prev => prev ? { ...prev, translation: e.target.value } : null);

                                                                    }}
                                                                    className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm text-white"
                                                                    placeholder="Translation"
                                                                />
                                                                <input
                                                                    value={editValue?.notes}
                                                                    onChange={e => {
                                                                        setEditValue(prev => prev ? { ...prev, notes: e.target.value } : null);

                                                                    }}
                                                                    className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-slate-400"
                                                                    placeholder="Notes"
                                                                />
                                                                <div className="flex justify-end gap-2">
                                                                    <button onClick={() => setEditingId(null)} className="text-xs text-slate-400 hover:text-white">Cancel</button>
                                                                    <button onClick={() => saveEdit(term.term)} className="text-xs text-indigo-400 hover:text-indigo-300">Save</button>
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
                                <h3 className="text-sm font-bold text-emerald-400 uppercase tracking-wider flex items-center"><Plus className="w-4 h-4 mr-2" /> Custom Terms ({customTerms.length})</h3>
                                <button onClick={addCustomTerm} className="text-xs bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 px-2 py-1 rounded border border-emerald-500/20 transition-colors">
                                    + Add Term
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
                                                            placeholder="Term"
                                                        />
                                                        <input
                                                            value={editValue?.translation}
                                                            onChange={e => {
                                                                setEditValue(prev => prev ? { ...prev, translation: e.target.value } : null);

                                                            }}
                                                            className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm text-white"
                                                            placeholder="Translation"
                                                        />
                                                        <input
                                                            value={editValue?.notes}
                                                            onChange={e => {
                                                                setEditValue(prev => prev ? { ...prev, notes: e.target.value } : null);

                                                            }}
                                                            className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-slate-400"
                                                            placeholder="Notes"
                                                        />
                                                        <div className="flex justify-end gap-2">
                                                            <button
                                                                onClick={() => {
                                                                    setCustomTerms(prev => prev.filter((_, i) => i !== idx));
                                                                    setEditingId(null);
                                                                }}
                                                                className="text-xs text-red-400 hover:text-red-300"
                                                            >
                                                                Delete
                                                            </button>
                                                            <button onClick={() => saveEdit(term.term)} className="text-xs text-emerald-400 hover:text-emerald-300">Save</button>
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
                        <button onClick={handleDiscard} className="px-4 py-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">
                            Discard All
                        </button>
                        <button onClick={handleConfirm} className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-lg font-medium shadow-lg shadow-indigo-500/25 transition-all flex items-center">
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Add {totalToAdd} Terms
                        </button>
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

    const renderSettingsModal = () => {

        if (!showSettings) return null;

        return (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl animate-fade-in relative overflow-hidden">
                    <div className="p-6 overflow-y-auto custom-scrollbar">
                        <button onClick={() => setShowSettings(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
                        <h2 className="text-xl font-bold text-white mb-6 flex items-center"><Settings className="w-5 h-5 mr-2 text-indigo-400" /> Settings</h2>

                        <div className="flex space-x-1 border-b border-slate-700 mb-6 overflow-x-auto">
                            {['api', 'performance', 'transcription', 'terminology'].map((tab) => (
                                <button
                                    key={tab}
                                    onClick={() => setSettingsTab(tab)}
                                    className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${settingsTab === tab ? 'bg-slate-800 text-indigo-400 border-t border-x border-slate-700' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}
                                >
                                    {tab === 'api' && 'API Keys'}
                                    {tab === 'performance' && 'Performance'}
                                    {tab === 'transcription' && 'Transcription'}
                                    {tab === 'prompts' && 'Prompts'}
                                    {tab === 'terminology' && 'Terminology'}
                                </button>
                            ))}
                        </div>

                        <div className="space-y-6 min-h-[400px]">
                            {settingsTab === 'api' && (
                                <div className="space-y-3 animate-fade-in">
                                    <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">API Configuration</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-300 mb-1.5">Gemini API Key</label>
                                            <div className="relative"><input type="password" value={settings.geminiKey} onChange={(e) => updateSetting('geminiKey', e.target.value.trim())} placeholder="Enter Gemini API Key" className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2.5 pl-3 pr-10 text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm" /></div>
                                            {ENV_GEMINI_KEY && !settings.geminiKey && (<p className="text-xs text-emerald-400 mt-1 flex items-center"><CheckCircle className="w-3 h-3 mr-1" /> Using API Key from environment</p>)}
                                            {ENV_GEMINI_KEY && settings.geminiKey && (<p className="text-xs text-amber-400 mt-1">Overriding environment API Key</p>)}
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-300 mb-1.5">OpenAI API Key</label>
                                            <div className="relative"><input type="password" value={settings.openaiKey} onChange={(e) => updateSetting('openaiKey', e.target.value.trim())} placeholder="Enter OpenAI API Key" className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2.5 pl-3 pr-10 text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm" /></div>
                                            {ENV_OPENAI_KEY && !settings.openaiKey && (<p className="text-xs text-emerald-400 mt-1 flex items-center"><CheckCircle className="w-3 h-3 mr-1" /> Using API Key from environment</p>)}
                                            {ENV_OPENAI_KEY && settings.openaiKey && (<p className="text-xs text-amber-400 mt-1">Overriding environment API Key</p>)}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {settingsTab === 'performance' && (
                                <div className="space-y-3 animate-fade-in">
                                    <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Performance & Batching</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-300 mb-1.5">Proofread Batch Size</label>
                                            <input type="number" value={settings.proofreadBatchSize} onChange={(e) => updateSetting('proofreadBatchSize', isNaN(parseInt(e.target.value)) ? 0 : parseInt(e.target.value))} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-slate-200 focus:outline-none focus:border-indigo-500 text-sm" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-300 mb-1.5">Translation Batch Size</label>
                                            <input type="number" value={settings.translationBatchSize} onChange={(e) => updateSetting('translationBatchSize', isNaN(parseInt(e.target.value)) ? 0 : parseInt(e.target.value))} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-slate-200 focus:outline-none focus:border-indigo-500 text-sm" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-300 mb-1.5">Chunk Duration (s)</label>
                                            <input type="number" value={settings.chunkDuration} onChange={(e) => updateSetting('chunkDuration', isNaN(parseInt(e.target.value)) ? 0 : parseInt(e.target.value))} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-slate-200 focus:outline-none focus:border-indigo-500 text-sm" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-300 mb-1.5">Concurrency (Flash)</label>
                                            <input type="number" value={settings.concurrencyFlash} onChange={(e) => updateSetting('concurrencyFlash', isNaN(parseInt(e.target.value)) ? 0 : parseInt(e.target.value))} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-slate-200 focus:outline-none focus:border-indigo-500 text-sm" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-300 mb-1.5">Concurrency (Pro)</label>
                                            <input type="number" value={settings.concurrencyPro} onChange={(e) => updateSetting('concurrencyPro', isNaN(parseInt(e.target.value)) ? 0 : parseInt(e.target.value))} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-slate-200 focus:outline-none focus:border-indigo-500 text-sm" />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {settingsTab === 'transcription' && (
                                <div className="space-y-3 animate-fade-in">
                                    <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Transcription & Style</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-300 mb-1.5">Transcription Model</label>
                                            <div className="relative"><AudioLines className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" /><select value={settings.transcriptionModel} onChange={(e) => updateSetting('transcriptionModel', e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 pl-9 pr-3 text-slate-200 focus:outline-none focus:border-indigo-500 text-sm appearance-none"><option value="whisper-1">Whisper (Standard)</option><option value="gpt-4o-audio-preview">GPT-4o Audio</option></select></div>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-300 mb-1.5">Genre / Context</label>
                                            <div className="relative"><Clapperboard className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" /><select value={isCustomGenre ? 'custom' : settings.genre} onChange={(e) => { const val = e.target.value; if (val === 'custom') updateSetting('genre', ''); else updateSetting('genre', val); }} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 pl-9 pr-3 text-slate-200 focus:outline-none focus:border-indigo-500 text-sm appearance-none"><option value="general">General</option><option value="anime">Anime / Animation</option><option value="movie">Movies / TV Series</option><option value="news">News / Documentary</option><option value="tech">Tech / Education</option><option value="custom">Custom...</option></select></div>
                                        </div>
                                    </div>
                                    {isCustomGenre && (
                                        <div className="pt-2 animate-fade-in"><label className="block text-xs font-medium text-indigo-400 mb-1.5">Custom Context / Genre Description</label><input type="text" value={settings.genre} onChange={(e) => updateSetting('genre', e.target.value)} placeholder="E.g., Minecraft Gameplay, Medical Lecture, 19th Century Drama... (Be specific for better tone)" className="w-full bg-slate-800 border border-slate-700 rounded-lg py-3 px-4 text-slate-200 focus:outline-none focus:border-indigo-500 text-sm placeholder-slate-600 shadow-inner" autoFocus /></div>
                                    )}

                                    <div className="pt-4 border-t border-slate-800">
                                        <div className="flex items-center justify-between mb-4">
                                            <div>
                                                <label className="block text-sm font-medium text-slate-300">Smart Split</label>
                                                <p className="text-xs text-slate-500">Use VAD to split audio at natural pauses (Recommended)</p>
                                            </div>
                                            <button
                                                onClick={() => updateSetting('useSmartSplit', !settings.useSmartSplit)}
                                                className={`w-10 h-5 rounded-full transition-colors relative ${settings.useSmartSplit !== false ? 'bg-indigo-500' : 'bg-slate-600'}`}
                                            >
                                                <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-transform ${settings.useSmartSplit !== false ? 'left-6' : 'left-1'}`} />
                                            </button>
                                        </div>

                                        <label className="block text-sm font-medium text-slate-300 mb-1.5">Export Mode</label>
                                        <div className="grid grid-cols-2 gap-3">
                                            <button onClick={() => updateSetting('outputMode', 'bilingual')} className={`p-3 rounded-lg border text-sm flex items-center justify-center space-x-2 transition-all ${settings.outputMode === 'bilingual' ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-750'}`}><Languages className="w-4 h-4" /><span>Bilingual (Original + CN)</span></button>
                                            <button onClick={() => updateSetting('outputMode', 'target_only')} className={`p-3 rounded-lg border text-sm flex items-center justify-center space-x-2 transition-all ${settings.outputMode === 'target_only' ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-750'}`}><Type className="w-4 h-4" /><span>Chinese Only</span></button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {settingsTab === 'prompts' && (
                                <div className="space-y-3 animate-fade-in">
                                    <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center"><MessageSquareText className="w-4 h-4 mr-1.5" /> Custom Prompts (Optional)</h3>
                                    <p className="text-xs text-slate-500 mb-2">Leave blank to use the default prompts for the selected genre.</p>
                                    <div><label className="block text-xs font-medium text-slate-400 mb-1">Translation Prompt</label><textarea value={settings.customTranslationPrompt} onChange={(e) => updateSetting('customTranslationPrompt', e.target.value)} placeholder="Override system instruction for initial translation..." className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-slate-200 text-xs focus:outline-none focus:border-indigo-500 h-20 resize-none" /></div>
                                    <div><label className="block text-xs font-medium text-slate-400 mb-1">Proofreading Prompt</label><textarea value={settings.customProofreadingPrompt} onChange={(e) => updateSetting('customProofreadingPrompt', e.target.value)} placeholder="Override system instruction for proofreading..." className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-slate-200 text-xs focus:outline-none focus:border-indigo-500 h-20 resize-none" /></div>
                                </div>
                            )}


                            {settingsTab === 'terminology' && (
                                <div className="space-y-4 animate-fade-in">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center"><Book className="w-4 h-4 mr-1.5" /> Glossary & Terminology</h3>
                                        <div className="flex items-center space-x-2">
                                            <label className="cursor-pointer px-3 py-1.5 rounded-lg text-xs font-medium flex items-center space-x-2 transition-colors bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white border border-slate-700">
                                                <Upload className="w-3 h-3" />
                                                <span className="hidden sm:inline">Import</span>
                                                <input type="file" accept=".json" onChange={handleImportGlossary} className="hidden" />
                                            </label>
                                            <button
                                                onClick={handleExportGlossary}
                                                disabled={!settings.glossary || settings.glossary.length === 0}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center space-x-2 transition-colors ${!settings.glossary || settings.glossary.length === 0 ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white border border-slate-700'}`}
                                                title="Export Glossary"
                                            >
                                                <Download className="w-3 h-3" />
                                                <span className="hidden sm:inline">Export</span>
                                            </button>
                                            <div className="w-px h-4 bg-slate-700 mx-1"></div>
                                            <button
                                                onClick={() => {
                                                    if (confirm("Are you sure you want to clear the entire glossary? This action cannot be undone.")) {
                                                        updateSetting('glossary', []);
                                                    }
                                                }}
                                                disabled={!settings.glossary || settings.glossary.length === 0}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center space-x-2 transition-colors ${!settings.glossary || settings.glossary.length === 0 ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20'}`}
                                                title="Clear all terms"
                                            >
                                                <Trash2 className="w-3 h-3" />
                                                <span className="hidden sm:inline">Clear All</span>
                                            </button>
                                            <button
                                                onClick={handleGenerateGlossary}
                                                disabled={isGeneratingGlossary || subtitles.length === 0}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center space-x-2 transition-colors ${isGeneratingGlossary || subtitles.length === 0 ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}
                                            >
                                                {isGeneratingGlossary ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                                                <span>{isGeneratingGlossary ? 'Analyzing...' : 'Auto-Generate from Subtitles'}</span>
                                            </button>
                                        </div>
                                    </div>

                                    <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700 space-y-4">
                                        <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Audio Extraction Settings</h4>
                                        <div className="flex items-center justify-between">
                                            <label className="text-sm text-slate-300">Enable Auto-Extraction</label>
                                            <button
                                                onClick={() => updateSetting('enableAutoGlossary', !settings.enableAutoGlossary)}
                                                className={`w-10 h-5 rounded-full transition-colors relative ${settings.enableAutoGlossary !== false ? 'bg-indigo-500' : 'bg-slate-600'}`}
                                            >
                                                <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-transform ${settings.enableAutoGlossary !== false ? 'left-6' : 'left-1'}`} />
                                            </button>
                                        </div>

                                        {settings.enableAutoGlossary !== false && (
                                            <>
                                                <div>
                                                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Sample Duration (Minutes)</label>
                                                    <select
                                                        value={settings.glossarySampleMinutes || 'all'}
                                                        onChange={(e) => updateSetting('glossarySampleMinutes', e.target.value === 'all' ? 'all' : Number(e.target.value))}
                                                        className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                                                    >
                                                        <option value="all">Analyze Full Audio (Best Quality)</option>
                                                        <option value="5">First 5 Minutes</option>
                                                        <option value="10">First 10 Minutes</option>
                                                        <option value="20">First 20 Minutes</option>
                                                        <option value="30">First 30 Minutes</option>
                                                    </select>
                                                    <p className="text-xs text-slate-500 mt-1">Limit analysis time to save tokens and speed up processing.</p>
                                                </div>
                                                <div className="flex items-center justify-between pt-2">
                                                    <div>
                                                        <label className="text-xs font-medium text-slate-400">Auto-Confirm Extracted Terms</label>
                                                        <p className="text-xs text-slate-500 mt-0.5">Skip review dialog and add terms automatically</p>
                                                    </div>
                                                    <button
                                                        onClick={() => updateSetting('glossaryAutoConfirm', !settings.glossaryAutoConfirm)}
                                                        className={`w-10 h-5 rounded-full transition-colors relative ${settings.glossaryAutoConfirm ? 'bg-indigo-500' : 'bg-slate-600'}`}
                                                    >
                                                        <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-transform ${settings.glossaryAutoConfirm ? 'left-6' : 'left-1'}`} />
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                    </div>

                                    <div className="bg-slate-800/50 border border-slate-700 rounded-lg overflow-hidden">
                                        <table className="w-full text-sm text-left">
                                            <thead className="text-xs text-slate-400 uppercase bg-slate-800 border-b border-slate-700">
                                                <tr>
                                                    <th className="px-4 py-3">Term (Original)</th>
                                                    <th className="px-4 py-3">Translation</th>
                                                    <th className="px-4 py-3">Notes</th>
                                                    <th className="px-4 py-3 w-10"></th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-700">
                                                {(settings.glossary || []).map((item, idx) => (
                                                    <tr key={idx} className="hover:bg-slate-800/50 group">
                                                        <td className="px-4 py-2">
                                                            <input
                                                                type="text"
                                                                value={item.term}
                                                                onChange={(e) => {
                                                                    const newGlossary = [...(settings.glossary || [])];
                                                                    newGlossary[idx].term = e.target.value;
                                                                    updateSetting('glossary', newGlossary);
                                                                }}
                                                                className="bg-transparent border-none focus:ring-0 w-full text-slate-200 placeholder-slate-600"
                                                                placeholder="Term"
                                                            />
                                                        </td>
                                                        <td className="px-4 py-2">
                                                            <input
                                                                type="text"
                                                                value={item.translation}
                                                                onChange={(e) => {
                                                                    const newGlossary = [...(settings.glossary || [])];
                                                                    newGlossary[idx].translation = e.target.value;
                                                                    updateSetting('glossary', newGlossary);
                                                                }}
                                                                className="bg-transparent border-none focus:ring-0 w-full text-slate-200 placeholder-slate-600"
                                                                placeholder="Translation"
                                                            />
                                                        </td>
                                                        <td className="px-4 py-2">
                                                            <input
                                                                type="text"
                                                                value={item.notes || ''}
                                                                onChange={(e) => {
                                                                    const newGlossary = [...(settings.glossary || [])];
                                                                    newGlossary[idx].notes = e.target.value;
                                                                    updateSetting('glossary', newGlossary);
                                                                }}
                                                                className="bg-transparent border-none focus:ring-0 w-full text-slate-400 placeholder-slate-700 text-xs"
                                                                placeholder="Context/Notes"
                                                            />
                                                        </td>
                                                        <td className="px-4 py-2 text-right">
                                                            <button
                                                                onClick={() => {
                                                                    const newGlossary = settings.glossary?.filter((_, i) => i !== idx);
                                                                    updateSetting('glossary', newGlossary);
                                                                }}
                                                                className="text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                                <tr>
                                                    <td colSpan={4} className="px-4 py-2 text-center border-t border-slate-700/50">
                                                        <button
                                                            onClick={() => {
                                                                const newGlossary = [...(settings.glossary || []), { term: '', translation: '' }];
                                                                updateSetting('glossary', newGlossary);
                                                            }}
                                                            className="text-xs text-indigo-400 hover:text-indigo-300 font-medium flex items-center justify-center py-1"
                                                        >
                                                            <Plus className="w-3 h-3 mr-1" /> Add Term
                                                        </button>
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            <div className="pt-4 border-t border-slate-800 flex justify-end">
                                <button onClick={() => setShowSettings(false)} className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-medium py-2 px-6 rounded-lg shadow-lg shadow-indigo-500/25 transition-all">
                                    Save Configuration
                                </button>
                            </div>
                        </div>
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
                            <FileText className="w-5 h-5 mr-2 text-blue-400" /> Application Logs
                        </h2>
                        <button onClick={() => setShowLogs(false)} className="text-slate-400 hover:text-white transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                        {logs.length === 0 ? (
                            <div className="text-center text-slate-500 py-12">
                                <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                                <p>No logs available</p>
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
                settings.concurrencyPro
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
                        <h3 className="text-xl font-bold text-white">Glossary Extraction Failed</h3>
                        <p className="text-slate-400 text-sm">
                            We couldn't extract glossary terms from the audio. This might be due to API errors or unclear audio.
                        </p>
                        <div className="flex flex-col space-y-2 pt-4">
                            <button onClick={handleRetryGlossary} disabled={isGeneratingGlossary} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2 rounded-lg transition-colors flex items-center justify-center">
                                {isGeneratingGlossary ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCcw className="w-4 h-4 mr-2" />}
                                {isGeneratingGlossary ? 'Retrying...' : 'Retry Extraction'}
                            </button>
                            <button onClick={handleContinue} disabled={isGeneratingGlossary} className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium py-2 rounded-lg transition-colors">
                                Skip (Continue without new terms)
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const renderHome = () => (
        <div className="min-h-screen bg-slate-950 flex flex-col p-4 md:p-8">
            <header className="flex justify-between items-center mb-12">
                <div className="flex items-center space-x-3">
                    <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg shadow-indigo-500/20"><Languages className="w-6 h-6 text-white" /></div>
                    <div><h1 className="text-2xl font-bold text-white tracking-tight">Gemini Subtitle Pro</h1><p className="text-sm text-slate-400">AI-Powered Subtitle Creation & Localization</p></div>
                </div>
                <div className="flex space-x-2">
                    <button onClick={() => setShowLogs(true)} className="p-3 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 rounded-xl transition-colors group" title="View Logs"><FileText className="w-5 h-5 text-slate-400 group-hover:text-blue-400" /></button>
                    <button onClick={() => setShowSettings(true)} className="p-3 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 rounded-xl transition-colors group"><Settings className="w-5 h-5 text-slate-400 group-hover:text-emerald-400" /></button>
                </div>
            </header>
            <main className="flex-1 flex flex-col items-center justify-center max-w-4xl mx-auto w-full">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full">
                    <button onClick={startNewProject} className="group relative bg-slate-900 border border-slate-800 hover:border-indigo-500/50 hover:bg-slate-800/50 rounded-3xl p-8 transition-all duration-300 shadow-2xl flex flex-col items-center text-center cursor-pointer">
                        <div className="w-20 h-20 bg-slate-800 group-hover:bg-indigo-500/20 rounded-2xl flex items-center justify-center mb-6 transition-colors"><FileVideo className="w-10 h-10 text-indigo-400 group-hover:scale-110 transition-transform" /></div>
                        <h2 className="text-2xl font-bold text-white mb-3">New Project</h2><p className="text-slate-400 leading-relaxed">Transcribe & Translate from Video/Audio using Whisper & Gemini.</p>
                    </button>
                    <button onClick={startImportProject} className="group relative bg-slate-900 border border-slate-800 hover:border-emerald-500/50 hover:bg-slate-800/50 rounded-3xl p-8 transition-all duration-300 shadow-2xl flex flex-col items-center text-center cursor-pointer">
                        <div className="w-20 h-20 bg-slate-800 group-hover:bg-emerald-500/20 rounded-2xl flex items-center justify-center mb-6 transition-colors"><FileText className="w-10 h-10 text-emerald-400 group-hover:scale-110 transition-transform" /></div>
                        <h2 className="text-2xl font-bold text-white mb-3">Open Subtitles</h2><p className="text-slate-400 leading-relaxed mb-4">Import existing .SRT or .ASS files to fix timing, proofread, or re-translate.</p>
                        <div className="flex flex-wrap gap-2 justify-center mt-2"><span className="text-xs px-2 py-1 bg-slate-800 rounded border border-slate-700 text-slate-500">Edit Text</span><span className="text-xs px-2 py-1 bg-slate-800 rounded border border-slate-700 text-slate-500">+ Video Ref</span></div>
                    </button>
                </div>
            </main>
            <footer className="mt-12 text-center text-slate-600 text-sm">Gemini Subtitle Pro v1.2</footer>
        </div>
    );

    const renderWorkspace = () => (
        <div className="min-h-screen bg-slate-950 text-slate-200 p-4 md:p-8 flex flex-col">
            <div className="max-w-7xl mx-auto w-full flex-1 flex flex-col space-y-6">
                <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800 shrink-0">
                    <div className="flex items-center space-x-4">
                        <button onClick={goBackHome} className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-white"><ArrowLeft className="w-5 h-5" /></button>
                        <div>
                            <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">{activeTab === 'new' ? 'New Project' : 'Subtitle Editor'}<span className="text-xs font-normal text-slate-500 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded">{activeTab === 'new' ? 'Generation' : 'Import Mode'}</span></h1>
                            <p className="text-xs text-slate-400 truncate max-w-[300px]">{file ? file.name : (subtitles.length > 0 ? `${subtitles.length} lines loaded` : 'No file selected')}</p>
                        </div>
                    </div>
                    <div className="flex items-center space-x-2">
                        <button onClick={() => setShowSnapshots(!showSnapshots)} disabled={snapshots.length === 0} className={`flex items-center space-x-2 px-4 py-2 border rounded-lg transition-colors text-sm font-medium ${snapshots.length > 0 ? 'bg-indigo-900/30 border-indigo-500/50 text-indigo-200' : 'bg-slate-900 border-slate-800 text-slate-600'}`}><GitCommit className="w-4 h-4" /><span className="hidden sm:inline">Versions</span></button>
                        {/* <button onClick={() => setView('quality_control')} className="flex items-center space-x-2 px-4 py-2 border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 rounded-lg transition-colors text-sm font-medium"><Sparkles className="w-4 h-4" /><span className="hidden sm:inline">Quality Control</span></button> */}
                        <button onClick={() => setShowLogs(true)} className="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors text-sm font-medium group" title="View Logs"><FileText className="w-4 h-4 text-slate-400 group-hover:text-blue-400 transition-colors" /></button>
                        <button onClick={() => setShowSettings(true)} className="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors text-sm font-medium group"><Settings className="w-4 h-4 text-slate-400 group-hover:text-emerald-400 transition-colors" /></button>
                    </div>
                </header>
                <div className="flex-1 flex flex-col lg:grid lg:grid-cols-12 gap-6 min-h-0">
                    <div className="lg:col-span-3 lg:h-full overflow-y-auto custom-scrollbar space-y-4">
                        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 shadow-sm space-y-4">
                            <div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-slate-300">Project Files</h3></div>
                            {file ? (
                                <div className="flex items-center p-3 bg-slate-800 rounded-lg border border-slate-700/50">
                                    <FileVideo className="w-8 h-8 text-indigo-400 mr-3 flex-shrink-0" />
                                    <div className="overflow-hidden flex-1 min-w-0"><p className="text-xs font-medium text-white truncate" title={file.name}>{file.name}</p><p className="text-[10px] text-slate-500">{Math.floor(duration / 60)}:{Math.floor(duration % 60).toString().padStart(2, '0')} · {(file.size / (1024 * 1024)).toFixed(1)}MB</p></div>
                                    <label className="cursor-pointer p-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors ml-1" title="Change Source File"><RefreshCcw className="w-3 h-3" /><input type="file" accept="video/*,audio/*" onChange={handleFileChange} className="hidden" disabled={isProcessing} /></label>
                                </div>
                            ) : (
                                <label className={`flex flex-col items-center justify-center w-full border-2 border-dashed border-slate-700 rounded-lg bg-slate-800/30 hover:bg-slate-800/50 hover:border-indigo-500/50 cursor-pointer transition-all group ${activeTab === 'new' ? 'h-32' : 'h-20'}`}>
                                    <div className="flex flex-col items-center justify-center py-4">
                                        {activeTab === 'new' ? (<><Upload className="w-8 h-8 text-indigo-400 mb-2 group-hover:scale-110 transition-transform" /><p className="text-xs font-bold text-slate-300">Upload Video / Audio</p><p className="text-[10px] text-slate-500 mt-1">To start transcription</p></>) : (<><Plus className="w-5 h-5 text-slate-500 group-hover:text-indigo-400 mb-1" /><p className="text-xs text-slate-500">Attach Media (Optional)</p></>)}
                                    </div>
                                    <input type="file" accept="video/*,audio/*" onChange={handleFileChange} className="hidden" />
                                </label>
                            )}
                            {activeTab === 'import' && (
                                <div className="pt-2 border-t border-slate-800">
                                    <div className="flex items-center justify-between mb-2"><h3 className="text-xs font-semibold text-slate-400">Subtitle File</h3>{subtitles.length > 0 && (<span className="text-[10px] text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded">{subtitles.length} lines</span>)}</div>
                                    {subtitles.length === 0 ? (
                                        <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-slate-700 rounded-lg bg-slate-800/30 hover:bg-slate-800/50 hover:border-emerald-500/50 cursor-pointer transition-all group">
                                            <div className="flex flex-col items-center justify-center pt-5 pb-6"><FileText className="w-6 h-6 text-emerald-500 group-hover:text-emerald-400 mb-1 group-hover:scale-110 transition-transform" /><p className="text-xs font-bold text-slate-300">Import .SRT / .ASS</p></div>
                                            <input type="file" accept=".srt,.ass" onChange={handleSubtitleImport} className="hidden" />
                                        </label>
                                    ) : (
                                        <div className="flex items-center p-2 bg-slate-800 rounded border border-slate-700/50"><FileText className="w-4 h-4 text-emerald-500 mr-2" /><p className="text-xs text-slate-300 flex-1">Subtitles Loaded</p><label className="cursor-pointer p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white" title="Replace Subtitles"><RefreshCcw className="w-3 h-3" /><input type="file" accept=".srt,.ass" onChange={handleSubtitleImport} className="hidden" /></label></div>
                                    )}
                                </div>
                            )}
                            <div className="flex flex-col space-y-2 text-xs text-slate-400 bg-slate-800/50 p-3 rounded-lg border border-slate-700/50">
                                <div className="flex items-center justify-between"><span className="flex items-center text-slate-500"><Monitor className="w-3 h-3 mr-2" /> Model</span><span className="font-medium text-slate-300">{settings.transcriptionModel === 'whisper-1' ? 'Whisper' : 'GPT-4o'}</span></div>
                                <div className="flex items-center justify-between"><span className="flex items-center text-slate-500"><Clapperboard className="w-3 h-3 mr-2" /> Genre</span><span className="font-medium text-slate-300 truncate max-w-[120px]" title={settings.genre}>{settings.genre}</span></div>
                            </div>
                        </div>
                        {activeTab === 'new' && (
                            <button onClick={handleGenerate} disabled={isProcessing || !file} className={`w-full py-3 px-4 rounded-xl font-semibold text-white shadow-lg transition-all flex items-center justify-center space-x-2 ${isProcessing || !file ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700' : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 shadow-indigo-500/25 hover:shadow-indigo-500/40 cursor-pointer'}`}>
                                {isProcessing ? (<Loader2 className="w-5 h-5 animate-spin" />) : (<Play className="w-5 h-5 fill-current" />)}
                                <span>{status === GenerationStatus.IDLE || status === GenerationStatus.COMPLETED || status === GenerationStatus.ERROR ? 'Start Processing' : 'Processing...'}</span>
                            </button>
                        )}
                        {error && (<div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400 flex items-start space-x-2 animate-fade-in"><AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /><span className="break-words w-full">{error}</span></div>)}
                        {(status === GenerationStatus.COMPLETED || status === GenerationStatus.PROOFREADING) && subtitles.length > 0 && (
                            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 shadow-sm animate-fade-in">
                                <h3 className="text-sm font-semibold text-white mb-3 flex items-center"><Download className="w-4 h-4 mr-2 text-emerald-400" /> Export</h3>
                                <div className="grid grid-cols-2 gap-2">
                                    <button onClick={() => handleDownload('srt')} className="flex flex-col items-center justify-center p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 rounded-lg transition-all"><span className="font-bold text-slate-200 text-sm">.SRT</span></button>
                                    <button onClick={() => handleDownload('ass')} className="flex flex-col items-center justify-center p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 rounded-lg transition-all"><span className="font-bold text-slate-200 text-sm">.ASS</span></button>
                                </div>
                                <div className="mt-3 text-[10px] text-center text-slate-500">Mode: {settings.outputMode === 'bilingual' ? 'Bilingual' : 'Translated Only'}</div>
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
                                    {snapshots.length === 0 ? (<div className="h-full flex flex-col items-center justify-center text-slate-500 opacity-50"><GitCommit className="w-12 h-12 mb-2" /><p>No versions available for this session</p></div>) : (snapshots.map((snap) => (<div key={snap.id} className="bg-slate-800/50 border border-slate-700 p-4 rounded-xl flex justify-between items-center"><div><h4 className="font-medium text-slate-200">{snap.description}</h4><p className="text-xs text-slate-500 mt-1">{snap.timestamp}</p></div><button onClick={() => restoreSnapshot(snap)} className="px-3 py-1.5 bg-slate-700 hover:bg-indigo-600 rounded text-xs text-white transition-colors flex items-center"><RotateCcw className="w-3 h-3 mr-1" /> Restore</button></div>)))}
                                </div>
                            ) : (
                                <div className="flex-1 overflow-y-auto custom-scrollbar relative w-full h-full max-h-[calc(100vh-220px)]" ref={subtitleListRef}>{renderSubtitleList()}</div>
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
            {showSettings && renderSettingsModal()}
            {showLogs && renderLogViewer()}
            {view === 'home' && renderHome()}
            {view === 'workspace' && renderWorkspace()}
            <ProgressOverlay />
            <ToastContainer toasts={toasts} removeToast={removeToast} />
        </>
    );
}
