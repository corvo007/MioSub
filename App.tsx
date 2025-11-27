import React, { useState, useEffect, useRef } from 'react';

import { Upload, FileVideo, Download, Trash2, Play, CheckCircle, AlertCircle, Languages, Loader2, Sparkles, Settings, X, Eye, EyeOff, MessageSquareText, AudioLines, Clapperboard, Monitor, CheckSquare, Square, RefreshCcw, Type, Clock, Wand2, FileText, RotateCcw, MessageCircle, GitCommit, ArrowLeft, Plus } from 'lucide-react';
import { SubtitleItem, GenerationStatus, OutputFormat, AppSettings, Genre, BatchOperationMode, SubtitleSnapshot, ChunkStatus, GENRE_PRESETS } from './types';
import { generateSrtContent, generateAssContent, downloadFile, parseSrt, parseAss } from './utils';
import { generateSubtitles, runBatchOperation } from './gemini';

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
    concurrencyPro: 2
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
    const [view, setView] = useState<'home' | 'workspace'>('home');

    // Logic State
    const [activeTab, setActiveTab] = useState<'new' | 'import'>('new');
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

    // Refs
    const subtitleListRef = useRef<HTMLDivElement>(null);

    const isProcessing = status === GenerationStatus.UPLOADING || status === GenerationStatus.PROCESSING || status === GenerationStatus.PROOFREADING;

    const isCustomGenre = !GENRE_PRESETS.includes(settings.genre);

    // --- Initialization ---
    useEffect(() => {
        const storedSettings = localStorage.getItem(SETTINGS_KEY);
        if (storedSettings) {
            try {
                const parsed = JSON.parse(storedSettings);
                setSettings(prev => ({ ...DEFAULT_SETTINGS, ...parsed }));
            } catch (e) { console.error("Settings load error"); }
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
            setFile(selectedFile);
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
        try {
            setStatus(GenerationStatus.PROCESSING);
            const result = await generateSubtitles(file, duration, settings, (update) => { setChunkProgress(prev => ({ ...prev, [update.id]: update })); }, (newSubs) => setSubtitles(newSubs));
            if (result.length === 0) throw new Error("No subtitles were generated.");
            setSubtitles(result); setStatus(GenerationStatus.COMPLETED); createSnapshot("Initial Generation", result);
        } catch (err: any) { setStatus(GenerationStatus.ERROR); setError(err.message); }
    };

    const handleBatchAction = async (mode: BatchOperationMode, singleIndex?: number) => {
        const indices: number[] = singleIndex !== undefined ? [singleIndex] : Array.from(selectedBatches) as number[];
        if (indices.length === 0) return;
        if (!settings.geminiKey && !ENV_GEMINI_KEY) { setError("Missing API Key."); return; }
        if (mode === 'fix_timestamps' && !file) { setError("Cannot fix timestamps without source media file."); return; }
        setStatus(GenerationStatus.PROOFREADING); setError(null); setChunkProgress({}); setStartTime(Date.now());
        try {
            const refined = await runBatchOperation(file, subtitles, indices, settings, mode, batchComments, (update) => { setChunkProgress(prev => ({ ...prev, [update.id]: update })); });
            setSubtitles(refined); setStatus(GenerationStatus.COMPLETED);
            setBatchComments(prev => { const next = { ...prev }; indices.forEach(idx => delete next[idx]); return next; });
            if (singleIndex === undefined) setSelectedBatches(new Set());
            const actionName = mode === 'fix_timestamps' ? 'Fix Time' : mode === 'retranslate' ? 'Retranslate' : 'Proofread';
            createSnapshot(`${actionName} (${indices.length} segments)`, refined);
        } catch (err: any) { setStatus(GenerationStatus.ERROR); setError(`Action failed: ${err.message}`); }
    };

    const handleDownload = (format: OutputFormat) => {
        if (!subtitles.length) return;
        const fileNameBase = file?.name?.split('.').slice(0, -1).join('.') || 'subtitles';
        const isBilingual = settings.outputMode === 'bilingual';
        const content = format === 'srt' ? generateSrtContent(subtitles, isBilingual) : generateAssContent(subtitles, fileNameBase, isBilingual);
        downloadFile(`${fileNameBase}.${format}`, content, format);
    };

    const updateLineComment = (id: number, comment: string) => { setSubtitles(prev => prev.map(s => s.id === id ? { ...s, comment } : s)); };
    const updateBatchComment = (chunkIdx: number, comment: string) => { setBatchComments(prev => ({ ...prev, [chunkIdx]: comment })); };
    const updateSetting = (key: keyof AppSettings, value: any) => { setSettings(prev => ({ ...prev, [key]: value })); };
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
                                <button onClick={() => handleBatchAction('fix_timestamps')} disabled={selectedBatches.size === 0} title="Fix Timestamps (Audio Required)" className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all shadow-sm border ${selectedBatches.size > 0 ? 'bg-slate-700 border-slate-600 text-emerald-400 hover:bg-slate-600 hover:border-emerald-400/50' : 'bg-slate-800 border-slate-800 text-slate-600 cursor-not-allowed'}`}>
                                    <Clock className="w-3 h-3" /><span className="hidden sm:inline">Fix Time</span>
                                </button>
                            )}
                            <button onClick={() => handleBatchAction('retranslate')} disabled={selectedBatches.size === 0} title="Re-translate Text" className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all shadow-sm border ${selectedBatches.size > 0 ? 'bg-slate-700 border-slate-600 text-blue-400 hover:bg-slate-600 hover:border-blue-400/50' : 'bg-slate-800 border-slate-800 text-slate-600 cursor-not-allowed'}`}>
                                <Languages className="w-3 h-3" /><span className="hidden sm:inline">Translate</span>
                            </button>
                            <button onClick={() => handleBatchAction('proofread')} disabled={selectedBatches.size === 0} title="Deep Proofread (Respects Comments)" className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all shadow-sm border ${selectedBatches.size > 0 ? 'bg-indigo-600 border-indigo-500 text-white hover:bg-indigo-500' : 'bg-slate-800 border-slate-800 text-slate-600 cursor-not-allowed'}`}>
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
                                        <div className="text-[10px] font-mono text-slate-600 min-w-[50px] pt-2">{(sub.startTime || '').split(',')[0]}</div>
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
                        <div className="flex items-center justify-between mb-2 h-8 shrink-0"><div className="flex items-center space-x-2"></div><StatusBadge /></div>
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
            <ProgressOverlay />
        </div>
    );

    return (
        <>
            {view === 'home' ? renderHome() : renderWorkspace()}
            {showSettings && (
                <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in overflow-y-auto">
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-2xl shadow-2xl relative my-12">
                        <button onClick={() => setShowSettings(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
                        <h2 className="text-xl font-bold text-white mb-6 flex items-center"><Settings className="w-5 h-5 mr-2 text-indigo-400" /> Settings</h2>
                        <div className="space-y-6">
                            <div className="space-y-3">
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

                            <div className="space-y-3 pt-4 border-t border-slate-800">
                                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Performance & Batching</h3>
                                <div className="grid grid-cols-3 gap-4">
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

                            <div className="space-y-3 pt-4 border-t border-slate-800">
                                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Transcription & Style</h3>
                                <div className="grid grid-cols-2 gap-4">
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
                            </div>

                            <div className="space-y-3 pt-4 border-t border-slate-800">
                                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">File Output Options</h3>
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1.5">Export Mode</label>
                                    <div className="grid grid-cols-2 gap-3">
                                        <button onClick={() => updateSetting('outputMode', 'bilingual')} className={`p-3 rounded-lg border text-sm flex items-center justify-center space-x-2 transition-all ${settings.outputMode === 'bilingual' ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-750'}`}><Languages className="w-4 h-4" /><span>Bilingual (Original + CN)</span></button>
                                        <button onClick={() => updateSetting('outputMode', 'target_only')} className={`p-3 rounded-lg border text-sm flex items-center justify-center space-x-2 transition-all ${settings.outputMode === 'target_only' ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-750'}`}><Type className="w-4 h-4" /><span>Chinese Only</span></button>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-3 pt-4 border-t border-slate-800">
                                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center"><MessageSquareText className="w-4 h-4 mr-1.5" /> Custom Prompts (Optional)</h3>
                                <p className="text-xs text-slate-500 mb-2">Leave blank to use the default prompts for the selected genre.</p>
                                <div><label className="block text-xs font-medium text-slate-400 mb-1">Translation Prompt</label><textarea value={settings.customTranslationPrompt} onChange={(e) => updateSetting('customTranslationPrompt', e.target.value)} placeholder="Override system instruction for initial translation..." className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-slate-200 text-xs focus:outline-none focus:border-indigo-500 h-20 resize-none" /></div>
                                <div><label className="block text-xs font-medium text-slate-400 mb-1">Proofreading Prompt</label><textarea value={settings.customProofreadingPrompt} onChange={(e) => updateSetting('customProofreadingPrompt', e.target.value)} placeholder="Override system instruction for proofreading..." className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-slate-200 text-xs focus:outline-none focus:border-indigo-500 h-20 resize-none" /></div>
                            </div>

                            <div className="pt-4"><button onClick={() => setShowSettings(false)} className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-medium py-2.5 rounded-lg shadow-lg shadow-indigo-500/25 transition-all">Save Configuration</button></div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );

}
