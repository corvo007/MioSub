import React, { useState, useEffect, useRef } from 'react';
import { Upload, FileVideo, Download, Trash2, Play, CheckCircle, AlertCircle, Languages, Loader2, Sparkles, Settings, X, Eye, EyeOff, MessageSquareText, AudioLines, Clapperboard, Monitor, CheckSquare, Square, RefreshCcw, Type, Clock, Wand2, FileText, RotateCcw, MessageCircle, GitCommit, ArrowLeft, Plus, Book, ShieldCheck, Scissors } from 'lucide-react';
import { SubtitleItem, GenerationStatus, OutputFormat, AppSettings, Genre, BatchOperationMode, SubtitleSnapshot, ChunkStatus, GENRE_PRESETS, DEFAULT_QC_CONFIG, GlossaryItem } from './types';
import { generateSrtContent, generateAssContent, downloadFile, parseSrt, parseAss, decodeAudio, logger } from './utils';
import { generateSubtitles, runBatchOperation, generateGlossary } from './gemini';
import { createQualityControlPipeline, QCPipelineResult } from './qualityControl';
import { QC_REVIEW_PROMPT, QC_FIX_PROMPT, QC_VALIDATE_PROMPT } from './prompts';
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
    qualityControl: DEFAULT_QC_CONFIG
};



const TimeTracker = ({ startTime, completed, total, status }: { startTime: number, completed: number, total: number, status: GenerationStatus }) => {
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, []);

    if (!startTime) return null;

    const elapsed = Math.floor((now - startTime) / 1000);
    let remaining: number | null = null;

    if (completed > 0 && total > completed) {
        const avgTime = (now - startTime) / completed;
        remaining = Math.floor((avgTime * (total - completed)) / 1000);
    }

    return (
        <div className="flex justify-between text-xs text-slate-400 mb-4 px-1">
            <span>Time Used: {elapsed}s</span>
            {remaining !== null && status !== GenerationStatus.COMPLETED && (
                <span>
                    Est. Remaining: {remaining}s
                </span>
            )}
        </div>
    );
};

export default function App() {
    // View State
    const [view, setView] = useState<'home' | 'workspace' | 'quality_control'>('home');

    // Logic State
    const [activeTab, setActiveTab] = useState<'new' | 'import'>('new');
    const [settingsTab, setSettingsTab] = useState('api');
    const [qcStatus, setQcStatus] = useState<'idle' | 'running' | 'completed' | 'error'>('idle');
    const [qcProgress, setQcProgress] = useState('');
    const [qcResult, setQcResult] = useState<QCPipelineResult | null>(null);
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

    // Phase 4 State
    const [glossary, setGlossary] = useState<GlossaryItem[]>([]);
    const [termIssues, setTermIssues] = useState<TerminologyIssue[]>([]);
    const [isGeneratingGlossary, setIsGeneratingGlossary] = useState(false);
    const [useSmartSplit, setUseSmartSplit] = useState(true);

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
                if (parsed.qualityControl) {
                    if (parsed.qualityControl.reviewModel?.modelName === 'gemini-3.0-pro') {
                        parsed.qualityControl.reviewModel.modelName = 'gemini-3-pro-preview';
                    }
                    if (parsed.qualityControl.fixModel?.modelName === 'gemini-3.0-pro') {
                        parsed.qualityControl.fixModel.modelName = 'gemini-3-pro-preview';
                    }
                    if (parsed.qualityControl.validateModel?.modelName === 'gemini-3.0-pro') {
                        parsed.qualityControl.validateModel.modelName = 'gemini-3-pro-preview';
                    }
                }

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
            const result = await generateSubtitles(file, duration, settings, (update) => { setChunkProgress(prev => ({ ...prev, [update.id]: update })); }, (newSubs) => setSubtitles(newSubs));
            if (result.length === 0) throw new Error("No subtitles were generated.");
            setSubtitles(result); setStatus(GenerationStatus.COMPLETED); createSnapshot("Initial Generation", result);
            logger.info("Subtitle generation completed", { count: result.length });
        } catch (err: any) {
            setStatus(GenerationStatus.ERROR);
            setError(err.message);
            logger.error("Subtitle generation failed", err);
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
            const refined = await runBatchOperation(file, subtitles, indices, settings, mode, batchComments, (update) => { setChunkProgress(prev => ({ ...prev, [update.id]: update })); });
            setSubtitles(refined); setStatus(GenerationStatus.COMPLETED);
            setBatchComments(prev => { const next = { ...prev }; indices.forEach(idx => delete next[idx]); return next; });
            if (singleIndex === undefined) setSelectedBatches(new Set());
            const actionName = mode === 'fix_timestamps' ? 'Fix Time' : 'Proofread';
            createSnapshot(`${actionName} (${indices.length} segments)`, refined);
            logger.info(`Batch action ${mode} completed`);
        } catch (err: any) {
            setStatus(GenerationStatus.ERROR);
            setError(`Action failed: ${err.message}`);
            logger.error(`Batch action ${mode} failed`, err);
        }
    };

    const handleStartQCPipeline = async () => {
        if (!file) { setError("No media file loaded"); return; }
        if (subtitles.length === 0) { setError("No subtitles to check"); return; }
        if (!settings.geminiKey && !ENV_GEMINI_KEY) { setError("API Key missing"); return; }

        // Calculate selected indices from selectedBatches
        const batchSize = settings.proofreadBatchSize || 20;
        const selectedIndices = selectedBatches.size > 0
            ? Array.from(selectedBatches).flatMap(batchIdx => {
                const start = Number(batchIdx) * batchSize;
                return Array.from({ length: batchSize }, (_, i) => start + i)
                    .filter(idx => idx < subtitles.length);
            })
            : undefined;

        setQcStatus('running');
        setQcProgress(selectedIndices
            ? `Initializing QC for ${selectedIndices.length} selected subtitles...`
            : 'Initializing QC for all subtitles...'
        );
        setQcResult(null);

        try {
            // Check if audio buffer is available
            let audioBuffer: AudioBuffer;
            if (settings.qualityControl?.audioCacheEnabled && audioCacheRef.current?.file === file) {
                setQcProgress('Using cached audio context...');
                audioBuffer = audioCacheRef.current.buffer;
            } else {
                setQcProgress('Loading audio context...');
                audioBuffer = await decodeAudio(file);
                if (settings.qualityControl?.audioCacheEnabled) {
                    audioCacheRef.current = { file, buffer: audioBuffer };
                }
            }

            const config = settings.qualityControl || DEFAULT_QC_CONFIG;

            setQcProgress('Starting Quality Control Pipeline...');
            logger.info("Starting QC Pipeline", { selectedIndicesCount: selectedIndices?.length, config });

            const result = await createQualityControlPipeline(
                subtitles,
                selectedIndices, // Pass selected indices
                audioBuffer,
                0, // Start from beginning
                config,
                settings.genre,
                { gemini: settings.geminiKey || ENV_GEMINI_KEY, openai: settings.openaiKey || ENV_OPENAI_KEY },
                {
                    review: (g) => QC_REVIEW_PROMPT(g),
                    fix: (g, issues) => QC_FIX_PROMPT(g, issues),
                    validate: (g, issues) => QC_VALIDATE_PROMPT(g, issues)
                },
                {
                    onProgress: (stage, progress, msg) => {
                        setQcProgress(`${stage}: ${msg}`);
                    },
                    onIterationComplete: async (iter, issues, subs) => {
                        setSubtitles(subs);
                        setQcProgress(`Iteration ${iter} complete. Found ${issues.length} issues.`);
                        return 'continue';
                    }
                }
            );

            setQcResult(result);
            setSubtitles(result.finalSubtitles);
            setQcStatus('completed');
            createSnapshot(`QC Complete (${result.iterations} iters)`, result.finalSubtitles);
            logger.info("QC Pipeline completed", { iterations: result.iterations, passed: result.passedValidation });

        } catch (e: any) {
            logger.error("QC Pipeline failed", e);
            setError(`QC Pipeline Failed: ${e.message}`);
            setQcStatus('error');
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
            const idA = Number(a.id);
            const idB = Number(b.id);
            if (!isNaN(idA) && !isNaN(idB)) return idA - idB;
            return String(a.id).localeCompare(String(b.id));
        });

        const contentChunks = chunks.filter(c => c.id !== 'init');
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
                                    <span className={`text-xs font-medium px-2 py-1 rounded-md ${chunk.stage === 'transcribing' ? 'bg-orange-500/10 text-orange-400' : chunk.stage === 'refining' ? 'bg-purple-500/10 text-purple-400' : chunk.stage === 'translating' ? 'bg-blue-500/10 text-blue-400' : 'text-slate-400'}`}>
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
                // Maybe show a toast? For now just console
                logger.info("No new terms found.");
            }
        } catch (e: any) {
            logger.error("Glossary generation failed", e);
            setError(e.message);
        } finally {
            setIsGeneratingGlossary(false);
        }
    };

    const SettingsModal = () => {
        if (!showSettings) return null;

        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl animate-fade-in relative overflow-hidden">
                    <div className="p-6 overflow-y-auto custom-scrollbar">
                        <button onClick={() => setShowSettings(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
                        <h2 className="text-xl font-bold text-white mb-6 flex items-center"><Settings className="w-5 h-5 mr-2 text-indigo-400" /> Settings</h2>

                        <div className="flex space-x-1 border-b border-slate-700 mb-6 overflow-x-auto">
                            {['api', 'performance', 'transcription', 'prompts', 'terminology'].map((tab) => (
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
                                            <input type="number" value={settings.proofreadBatchSize} onChange={(e) => updateSetting('proofreadBatchSize', parseInt(e.target.value) || 20)} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-slate-200 focus:outline-none focus:border-indigo-500 text-sm" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-300 mb-1.5">Translation Batch Size</label>
                                            <input type="number" value={settings.translationBatchSize} onChange={(e) => updateSetting('translationBatchSize', parseInt(e.target.value) || 20)} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-slate-200 focus:outline-none focus:border-indigo-500 text-sm" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-300 mb-1.5">Chunk Duration (s)</label>
                                            <input type="number" value={settings.chunkDuration} onChange={(e) => updateSetting('chunkDuration', parseInt(e.target.value) || 300)} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-slate-200 focus:outline-none focus:border-indigo-500 text-sm" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-300 mb-1.5">Concurrency (Flash)</label>
                                            <input type="number" value={settings.concurrencyFlash} onChange={(e) => updateSetting('concurrencyFlash', parseInt(e.target.value) || 5)} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-slate-200 focus:outline-none focus:border-indigo-500 text-sm" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-300 mb-1.5">Concurrency (Pro)</label>
                                            <input type="number" value={settings.concurrencyPro} onChange={(e) => updateSetting('concurrencyPro', parseInt(e.target.value) || 2)} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-slate-200 focus:outline-none focus:border-indigo-500 text-sm" />
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

                            {/* {settingsTab === 'quality_control' && (
                                <div className="space-y-4 animate-fade-in">
                                    <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center"><Sparkles className="w-4 h-4 mr-1.5" /> Quality Control Pipeline</h3>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700">
                                            <h4 className="text-xs font-bold text-indigo-300 mb-2">Review Stage</h4>
                                            <div className="space-y-2">
                                                <label className="block text-xs text-slate-400">Model</label>
                                                <select
                                                    value={settings.qualityControl?.reviewModel.modelName}
                                                    onChange={(e) => {
                                                        const newQC = { ...settings.qualityControl || DEFAULT_QC_CONFIG };
                                                        newQC.reviewModel.modelName = e.target.value;
                                                        updateSetting('qualityControl', newQC);
                                                    }}
                                                    className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200"
                                                >
                                                    <option value="gemini-3-pro-preview">Gemini 3 Pro</option>
                                                    <option value="gemini-3-pro-preview">Gemini 3 Pro</option>
                                                    <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                                                    <option value="gpt-5.1">GPT-5.1</option>
                                                    <option value="gpt-5-pro">GPT-5 Pro</option>
                                                    <option value="gpt-4o">GPT-4o</option>
                                                </select>
                                            </div>
                                        </div>
                                        <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700">
                                            <h4 className="text-xs font-bold text-emerald-300 mb-2">Fix Stage</h4>
                                            <div className="space-y-2">
                                                <label className="block text-xs text-slate-400">Model</label>
                                                <select
                                                    value={settings.qualityControl?.fixModel.modelName}
                                                    onChange={(e) => {
                                                        const newQC = { ...settings.qualityControl || DEFAULT_QC_CONFIG };
                                                        newQC.fixModel.modelName = e.target.value;
                                                        updateSetting('qualityControl', newQC);
                                                    }}
                                                    className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200"
                                                >
                                                    <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                                                    <option value="gemini-3-pro-preview">Gemini 3 Pro</option>
                                                    <option value="gpt-5.1">GPT-5.1</option>
                                                    <option value="gpt-5-pro">GPT-5 Pro</option>
                                                    <option value="gpt-4o">GPT-4o</option>
                                                </select>
                                            </div>
                                        </div>
                                        <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700">
                                            <h4 className="text-xs font-bold text-purple-300 mb-2">Validate Stage</h4>
                                            <div className="space-y-2">
                                                <label className="block text-xs text-slate-400">Model</label>
                                                <select
                                                    value={settings.qualityControl?.validateModel.modelName}
                                                    onChange={(e) => {
                                                        const newQC = { ...settings.qualityControl || DEFAULT_QC_CONFIG };
                                                        newQC.validateModel.modelName = e.target.value;
                                                        updateSetting('qualityControl', newQC);
                                                    }}
                                                    className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
                                                >
                                                    <option value="gpt-5.1">GPT-5.1</option>
                                                    <option value="gpt-5-pro">GPT-5 Pro</option>
                                                    <option value="gpt-4o">GPT-4o</option>
                                                    <option value="gemini-3-pro-preview">Gemini 3 Pro</option>
                                                    <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )} */}

                            {settingsTab === 'terminology' && (
                                <div className="space-y-4 animate-fade-in">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center"><Book className="w-4 h-4 mr-1.5" /> Glossary & Terminology</h3>
                                        <div className="flex items-center space-x-2">
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

    const renderHome = () => (
        <div className="min-h-screen bg-slate-950 flex flex-col p-4 md:p-8">
            <header className="flex justify-between items-center mb-12">
                <div className="flex items-center space-x-3">
                    <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg shadow-indigo-500/20"><Languages className="w-6 h-6 text-white" /></div>
                    <div><h1 className="text-2xl font-bold text-white tracking-tight">Gemini Subtitle Pro</h1><p className="text-sm text-slate-400">AI-Powered Subtitle Creation & Localization</p></div>
                </div>
                <button onClick={() => setShowSettings(true)} className="p-3 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 rounded-xl transition-colors group"><Settings className="w-5 h-5 text-slate-400 group-hover:text-emerald-400" /></button>
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
                                <div className="flex items-center justify-between">
                                    <span className="flex items-center text-slate-500"><Scissors className="w-3 h-3 mr-2" /> Smart Split</span>
                                    <button
                                        onClick={() => setUseSmartSplit(!useSmartSplit)}
                                        className={`w-8 h-4 rounded-full transition-colors relative ${useSmartSplit ? 'bg-indigo-600' : 'bg-slate-700'}`}
                                    >
                                        <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${useSmartSplit ? 'left-4.5' : 'left-0.5'}`} style={{ left: useSmartSplit ? '18px' : '2px' }}></div>
                                    </button>
                                </div>
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


                    {/* Consistency Dialog */}



                </div>
            </div>
        </div>
    );

    const renderQualityControl = () => (
        <div className="min-h-screen bg-slate-950 text-slate-200 p-4 md:p-8 flex flex-col">
            <div className="max-w-7xl mx-auto w-full flex-1 flex flex-col space-y-6">
                <header className="flex items-center justify-between pb-6 border-b border-slate-800">
                    <div className="flex items-center space-x-4">
                        <button onClick={() => setView('workspace')} className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-white">
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <div>
                            <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                                <Sparkles className="w-5 h-5 text-indigo-400" />
                                Quality Control Pipeline
                            </h1>
                            <p className="text-xs text-slate-400">Automated Review, Fix, and Validation</p>
                        </div>
                    </div>
                    <div className="flex items-center space-x-3">
                        {qcStatus === 'completed' && (
                            <button
                                onClick={() => { setView('workspace'); }}
                                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-emerald-500/20 flex items-center"
                            >
                                <CheckCircle className="w-4 h-4 mr-2" />
                                Apply & Return
                            </button>
                        )}
                    </div>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
                    <div className="lg:col-span-1 space-y-6">
                        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm">
                            <h3 className="text-sm font-semibold text-slate-300 mb-4 uppercase tracking-wider">Pipeline Status</h3>

                            <div className="flex flex-col items-center justify-center py-6 space-y-4">
                                {qcStatus === 'idle' && (
                                    <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center">
                                        <Sparkles className="w-8 h-8 text-slate-600" />
                                    </div>
                                )}
                                {qcStatus === 'running' && (
                                    <div className="relative">
                                        <div className="w-16 h-16 rounded-full border-4 border-slate-800 border-t-indigo-500 animate-spin"></div>
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <Loader2 className="w-6 h-6 text-indigo-400 animate-pulse" />
                                        </div>
                                    </div>
                                )}
                                {qcStatus === 'completed' && (
                                    <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                                        <CheckCircle className="w-8 h-8 text-emerald-500" />
                                    </div>
                                )}
                                {qcStatus === 'error' && (
                                    <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/20">
                                        <AlertCircle className="w-8 h-8 text-red-500" />
                                    </div>
                                )}

                                <div className="text-center">
                                    <p className="text-lg font-medium text-white">
                                        {qcStatus === 'idle' && 'Ready to Start'}
                                        {qcStatus === 'running' && 'Processing...'}
                                        {qcStatus === 'completed' && 'QC Completed'}
                                        {qcStatus === 'error' && 'Pipeline Failed'}
                                    </p>
                                    <p className="text-sm text-slate-400 mt-1 max-w-[200px] mx-auto">
                                        {qcStatus === 'running' ? qcProgress : (qcStatus === 'idle' ? 'Run the automated quality control pipeline to detect and fix issues.' : '')}
                                        {qcStatus === 'error' && error}
                                    </p>
                                </div>

                                {qcStatus === 'running' && (
                                    <div className="w-full max-w-xs mx-auto mt-4">
                                        <div className="flex justify-between mb-2">
                                            {['Review', 'Fix', 'Validate'].map((step, i) => {
                                                const currentStep = qcProgress.toLowerCase().includes('review') ? 0
                                                    : qcProgress.toLowerCase().includes('fix') ? 1
                                                        : qcProgress.toLowerCase().includes('validate') ? 2 : -1;

                                                const isActive = i === currentStep;
                                                const isCompleted = i < currentStep;

                                                return (
                                                    <div key={step} className="flex flex-col items-center">
                                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all ${isActive ? 'border-indigo-500 bg-indigo-500/20 text-indigo-400' : isCompleted ? 'border-emerald-500 bg-emerald-500/20 text-emerald-400' : 'border-slate-700 bg-slate-800 text-slate-600'}`}>
                                                            {isCompleted ? <CheckCircle className="w-4 h-4" /> : <span className="text-xs font-bold">{i + 1}</span>}
                                                        </div>
                                                        <span className={`text-[10px] mt-1 font-medium ${isActive ? 'text-indigo-400' : isCompleted ? 'text-emerald-400' : 'text-slate-600'}`}>{step}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                                            <div className="h-full bg-indigo-500/50 animate-progress-indeterminate"></div>
                                        </div>
                                    </div>
                                )}

                                {qcStatus === 'idle' && (
                                    <button
                                        onClick={handleStartQCPipeline}
                                        className="w-full py-3 px-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl font-semibold shadow-lg shadow-indigo-500/25 transition-all flex items-center justify-center"
                                    >
                                        <Play className="w-5 h-5 mr-2 fill-current" />
                                        Start Pipeline
                                    </button>
                                )}
                                {qcStatus === 'completed' && (
                                    <button
                                        onClick={handleStartQCPipeline}
                                        className="w-full py-2 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-medium transition-colors flex items-center justify-center"
                                    >
                                        <RotateCcw className="w-4 h-4 mr-2" />
                                        Run Again
                                    </button>
                                )}
                            </div>
                        </div>

                        {qcResult && (
                            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm animate-fade-in">
                                <h3 className="text-sm font-semibold text-slate-300 mb-4 uppercase tracking-wider">Summary</h3>
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center p-2 bg-slate-800/50 rounded">
                                        <span className="text-sm text-slate-400">Iterations</span>
                                        <span className="font-mono font-medium text-white">{qcResult.iterations}</span>
                                    </div>
                                    <div className="flex justify-between items-center p-2 bg-slate-800/50 rounded">
                                        <span className="text-sm text-slate-400">Total Issues</span>
                                        <span className="font-mono font-medium text-amber-400">{qcResult.allIssues.length}</span>
                                    </div>
                                    <div className="flex justify-between items-center p-2 bg-slate-800/50 rounded">
                                        <span className="text-sm text-slate-400">Validation</span>
                                        <span className={`font-mono font-medium ${qcResult.passedValidation ? 'text-emerald-400' : 'text-red-400'}`}>
                                            {qcResult.passedValidation ? 'PASSED' : 'FAILED'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm flex flex-col min-h-[500px]">
                        <h3 className="text-sm font-semibold text-slate-300 mb-4 uppercase tracking-wider flex items-center">
                            <GitCommit className="w-4 h-4 mr-2" />
                            Pipeline History
                        </h3>

                        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pr-2">
                            {!qcResult && qcStatus === 'idle' && (
                                <div className="h-full flex flex-col items-center justify-center text-slate-600 opacity-50">
                                    <Sparkles className="w-12 h-12 mb-3" />
                                    <p>Pipeline results will appear here</p>
                                </div>
                            )}

                            {qcResult?.history.map((iteration, idx) => (
                                <div key={idx} className="border border-slate-700/50 rounded-lg overflow-hidden bg-slate-800/30">
                                    <div className="bg-slate-800/80 px-4 py-2 border-b border-slate-700/50 flex justify-between items-center">
                                        <span className="text-xs font-bold text-slate-300 uppercase">Iteration {iteration.iteration}</span>
                                        <span className="text-xs font-mono text-slate-500">Step {idx + 1}</span>
                                    </div>
                                    <div className="p-4 space-y-3">
                                        {iteration.stages.map((stage: any, stageIdx: number) => (
                                            <div key={stageIdx} className="border-l-2 border-slate-600 pl-3">
                                                <div className="text-xs font-semibold text-slate-400 uppercase mb-1">{stage.name}</div>

                                                {stage.name === 'Review' && (
                                                    <div className="text-sm">
                                                        <div className="text-amber-400 mb-1">
                                                            Issues Found: {stage.output?.issues?.length || 0}
                                                        </div>
                                                        {stage.output?.issues?.length > 0 && (
                                                            <ul className="list-disc list-inside space-y-1 text-slate-400 text-xs">
                                                                {stage.output.issues.slice(0, 3).map((issue: any, i: number) => (
                                                                    <li key={i}>
                                                                        <span className="text-amber-500">[{issue.severity}]</span> {issue.description.slice(0, 60)}...
                                                                    </li>
                                                                ))}
                                                                {stage.output.issues.length > 3 && (
                                                                    <li className="opacity-50">...and {stage.output.issues.length - 3} more</li>
                                                                )}
                                                            </ul>
                                                        )}
                                                    </div>
                                                )}

                                                {stage.name === 'Fix' && (
                                                    <div className="text-sm text-blue-400">
                                                        Fixes Applied: {stage.output?.fixedSubtitles?.length || 0} subtitles processed
                                                    </div>
                                                )}

                                                {stage.name === 'Validate' && (
                                                    <div className="text-sm">
                                                        <div className={stage.output?.passedValidation ? 'text-emerald-400' : 'text-red-400'}>
                                                            Validation: {stage.output?.passedValidation ? 'PASSED ✓' : 'FAILED ✗'}
                                                        </div>
                                                        {stage.output?.newIssues?.length > 0 && (
                                                            <div className="mt-1 text-xs text-slate-500">
                                                                New Issues: {stage.output.newIssues.length}
                                                            </div>
                                                        )}
                                                        {stage.output?.unresolvedIssues?.length > 0 && (
                                                            <div className="text-xs text-red-400">
                                                                Unresolved: {stage.output.unresolvedIssues.length}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                <div className="text-xs text-slate-600 mt-1">
                                                    Duration: {(stage.duration / 1000).toFixed(1)}s
                                                    {stage.success ? ' ✓' : ' ✗'}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-indigo-500/30">
            <ProgressOverlay />
            <SettingsModal />
            {view === 'home' && renderHome()}
            {view === 'workspace' && renderWorkspace()}
            {/* {view === 'quality_control' && renderQualityControl()} */}
        </div>
    );
}
