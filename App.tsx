
import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { Upload, FileVideo, Download, History, Trash2, Play, CheckCircle, AlertCircle, Languages, Loader2, Sparkles, Settings, X, Eye, EyeOff, MessageSquareText, AudioLines, Clapperboard, Monitor, CheckSquare, Square, RefreshCcw, Type, Clock, Wand2 } from 'lucide-react';
import { SubtitleItem, HistoryItem, GenerationStatus, OutputFormat, AppSettings, Genre, BatchOperationMode } from './types';
import { generateSrtContent, generateAssContent, downloadFile } from './utils';
import { generateSubtitles, runBatchOperation, PROOFREAD_BATCH_SIZE } from './gemini';

const STORAGE_KEY = 'gemini_subtitle_history';
const SETTINGS_KEY = 'gemini_subtitle_settings';

const DEFAULT_SETTINGS: AppSettings = {
  geminiKey: '',
  openaiKey: '',
  transcriptionModel: 'whisper-1',
  genre: 'general',
  customTranslationPrompt: '',
  customProofreadingPrompt: '',
  outputMode: 'bilingual'
};

const GENRE_PRESETS = ['general', 'anime', 'movie', 'news', 'tech'];

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [duration, setDuration] = useState<number>(0);
  const [status, setStatus] = useState<GenerationStatus>(GenerationStatus.IDLE);
  const [progressMsg, setProgressMsg] = useState('');
  const [subtitles, setSubtitles] = useState<SubtitleItem[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Settings State
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showOpenAIKey, setShowOpenAIKey] = useState(false);

  // Batch Selection State
  const [selectedBatches, setSelectedBatches] = useState<Set<number>>(new Set());
  
  // View State
  const [showSourceText, setShowSourceText] = useState(true);

  const isProcessing = status === GenerationStatus.UPLOADING || status === GenerationStatus.PROCESSING || status === GenerationStatus.PROOFREADING;
  
  const isCustomGenre = !GENRE_PRESETS.includes(settings.genre);

  // --- Initialization ---
  useEffect(() => {
    // Load History
    const storedHistory = localStorage.getItem(STORAGE_KEY);
    if (storedHistory) {
      try {
        setHistory(JSON.parse(storedHistory));
      } catch (e) { console.error("History load error"); }
    }
    // Load Settings
    const storedSettings = localStorage.getItem(SETTINGS_KEY);
    if (storedSettings) {
      try {
        const parsed = JSON.parse(storedSettings);
        // Only merge if not overriding empty keys intentionally, but user wants clean slate logic if missing.
        // Actually user wants initial fields empty. If localStorage has data, we use it. If not, we use default (empty).
        setSettings(prev => ({ ...DEFAULT_SETTINGS, ...parsed }));
      } catch (e) { console.error("Settings load error"); }
    }
  }, []);

  // Save settings on change
  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  // --- Helpers ---
  const getFileDuration = (f: File): Promise<number> => {
    return new Promise((resolve) => {
      const element = f.type.startsWith('audio') 
        ? new Audio() 
        : document.createElement('video');
      
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

  const saveToHistory = (subs: SubtitleItem[], currentFile: File) => {
    const newItem: HistoryItem = {
      id: Date.now().toString(),
      fileName: currentFile.name,
      date: new Date().toLocaleString(),
      subtitles: subs
    };
    const existing = history.filter(h => h.fileName !== currentFile.name);
    const updatedHistory = [newItem, ...existing].slice(0, 10);
    setHistory(updatedHistory);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedHistory));
  };

  const toggleBatch = (index: number) => {
      const newSet = new Set(selectedBatches);
      if (newSet.has(index)) {
          newSet.delete(index);
      } else {
          newSet.add(index);
      }
      setSelectedBatches(newSet);
  };

  const toggleAllBatches = (totalBatches: number) => {
      if (selectedBatches.size === totalBatches) {
          setSelectedBatches(new Set());
      } else {
          setSelectedBatches(new Set(Array.from({ length: totalBatches }, (_, i) => i)));
      }
  };

  // --- Handlers ---

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setError(null);
      setSubtitles([]);
      setStatus(GenerationStatus.IDLE);
      setSelectedBatches(new Set());
      
      try {
        const d = await getFileDuration(selectedFile);
        setDuration(d);
      } catch (e) {
        setDuration(0);
      }
    }
  };

  const handleGenerate = async () => {
    if (!file) {
      setError("Please upload a media file first.");
      return;
    }

    if (!settings.geminiKey || !settings.openaiKey) {
      setError("API Keys are missing. Please configure them in Settings.");
      setShowSettings(true);
      return;
    }

    setStatus(GenerationStatus.UPLOADING);
    setError(null);
    setSubtitles([]);
    setSelectedBatches(new Set());

    try {
      const result = await generateSubtitles(
        file, 
        duration, 
        settings, 
        (msg) => setProgressMsg(msg),
        (newSubs) => setSubtitles(newSubs) 
      );
      
      if (result.length === 0) throw new Error("No subtitles were generated.");

      setSubtitles(result);
      setStatus(GenerationStatus.COMPLETED);
      saveToHistory(result, file);

    } catch (err: any) {
      setStatus(GenerationStatus.ERROR);
      setError(err.message);
    }
  };

  const handleBatchAction = async (mode: BatchOperationMode, singleIndex?: number) => {
      const indices = singleIndex !== undefined ? [singleIndex] : Array.from(selectedBatches);
      
      if (indices.length === 0) return;
      if (!file || !settings.geminiKey) {
          setError("Missing file or API Key.");
          return;
      }

      setStatus(GenerationStatus.PROOFREADING);
      setError(null);

      try {
          const refined = await runBatchOperation(
              file, 
              subtitles, 
              indices, 
              settings,
              mode,
              (msg) => setProgressMsg(msg)
          );
          setSubtitles(refined);
          setStatus(GenerationStatus.COMPLETED);
          saveToHistory(refined, file);
          // Clear selection after success if it was a multi-select action
          if (singleIndex === undefined && indices.length === Math.ceil(subtitles.length / PROOFREAD_BATCH_SIZE)) {
             setSelectedBatches(new Set());
          }
      } catch (err: any) {
          setStatus(GenerationStatus.ERROR);
          setError(`Action failed: ${err.message}`);
      }
  };

  const handleDownload = (format: OutputFormat) => {
    if (!subtitles.length) return;
    const fileNameBase = file?.name?.split('.').slice(0, -1).join('.') || 'subtitles';
    const isBilingual = settings.outputMode === 'bilingual';
    const content = format === 'srt' 
        ? generateSrtContent(subtitles, isBilingual) 
        : generateAssContent(subtitles, fileNameBase, isBilingual);
    downloadFile(`${fileNameBase}.${format}`, content, format);
  };

  const loadFromHistory = (item: HistoryItem) => {
    setSubtitles(item.subtitles);
    setStatus(GenerationStatus.COMPLETED);
    setFile({ name: item.fileName, size: 0 } as File); 
    setShowHistory(false);
    setError(null);
    setSelectedBatches(new Set());
  };

  const clearHistory = () => {
    if(confirm("Clear all history?")) {
        setHistory([]);
        localStorage.removeItem(STORAGE_KEY);
    }
  };

  const updateSetting = (key: keyof AppSettings, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  // --- Rendering Chunks ---
  const renderSubtitleList = () => {
    const chunks: SubtitleItem[][] = [];
    for (let i = 0; i < subtitles.length; i += PROOFREAD_BATCH_SIZE) {
        chunks.push(subtitles.slice(i, i + PROOFREAD_BATCH_SIZE));
    }
    
    if (chunks.length === 0) {
        return (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-600">
               <div className="w-16 h-16 border-2 border-slate-700 border-dashed rounded-full flex items-center justify-center mb-4">
                  <Languages className="w-6 h-6" />
               </div>
               <p className="font-medium">No subtitles generated yet</p>
               <p className="text-sm mt-2 max-w-xs text-center opacity-70">Upload a video or audio file to start.</p>
            </div>
        );
    }

    return (
        <div className="p-4 space-y-6">
            {/* Header Controls for Selection */}
            {status === GenerationStatus.COMPLETED && (
                 <div className="flex flex-wrap items-center gap-3 bg-slate-800/80 p-3 rounded-lg border border-slate-700 sticky top-0 z-20 backdrop-blur-md shadow-md justify-between">
                    <div className="flex items-center space-x-4">
                        <button 
                            onClick={() => toggleAllBatches(chunks.length)}
                            className="flex items-center space-x-2 text-sm text-slate-300 hover:text-white transition-colors"
                        >
                            {selectedBatches.size === chunks.length ? <CheckSquare className="w-4 h-4 text-indigo-400" /> : <Square className="w-4 h-4 text-slate-500" />}
                            <span>{selectedBatches.size === chunks.length ? 'Deselect All' : 'Select All'}</span>
                        </button>

                        <button 
                            onClick={() => setShowSourceText(!showSourceText)}
                            className="flex items-center space-x-2 text-sm text-slate-400 hover:text-white transition-colors"
                        >
                            {showSourceText ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                            <span className="hidden sm:inline">{showSourceText ? "Hide Original" : "Show Original"}</span>
                        </button>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                        <div className="text-xs text-slate-500 font-mono mr-2">
                             {selectedBatches.size} Selected
                        </div>
                        
                        {/* Action Buttons */}
                        <button
                            onClick={() => handleBatchAction('fix_timestamps')}
                            disabled={selectedBatches.size === 0}
                            title="Fix Timestamps (Gemini 2.5 Flash)"
                            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all shadow-sm border ${
                                selectedBatches.size > 0 
                                ? 'bg-slate-700 border-slate-600 text-emerald-400 hover:bg-slate-600 hover:border-emerald-400/50' 
                                : 'bg-slate-800 border-slate-800 text-slate-600 cursor-not-allowed'
                            }`}
                        >
                            <Clock className="w-3 h-3" />
                            <span className="hidden sm:inline">Fix Time</span>
                        </button>

                        <button
                            onClick={() => handleBatchAction('retranslate')}
                            disabled={selectedBatches.size === 0}
                            title="Re-translate Text (Gemini 2.5 Flash)"
                            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all shadow-sm border ${
                                selectedBatches.size > 0 
                                ? 'bg-slate-700 border-slate-600 text-blue-400 hover:bg-slate-600 hover:border-blue-400/50' 
                                : 'bg-slate-800 border-slate-800 text-slate-600 cursor-not-allowed'
                            }`}
                        >
                            <Languages className="w-3 h-3" />
                            <span className="hidden sm:inline">Translate</span>
                        </button>

                        <button
                            onClick={() => handleBatchAction('proofread')}
                            disabled={selectedBatches.size === 0}
                            title="Deep Proofread (Gemini 3 Pro)"
                            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all shadow-sm border ${
                                selectedBatches.size > 0 
                                ? 'bg-indigo-600 border-indigo-500 text-white hover:bg-indigo-500' 
                                : 'bg-slate-800 border-slate-800 text-slate-600 cursor-not-allowed'
                            }`}
                        >
                            <Sparkles className="w-3 h-3" />
                            <span className="hidden sm:inline">Proofread</span>
                        </button>
                    </div>
                 </div>
            )}

            {chunks.map((chunk, chunkIdx) => {
                const isSelected = selectedBatches.has(chunkIdx);
                const startTime = chunk[0].startTime.split(',')[0];
                const endTime = chunk[chunk.length - 1].endTime.split(',')[0];
                
                return (
                    <div key={chunkIdx} className={`border rounded-xl overflow-hidden transition-all ${isSelected ? 'border-indigo-500/50 bg-indigo-500/5' : 'border-slate-700/50 bg-slate-900/40'}`}>
                        {/* Batch Header */}
                        <div 
                            className={`px-4 py-3 flex justify-between items-center ${isSelected ? 'bg-indigo-900/20' : 'bg-slate-800/50'}`}
                        >
                            <div className="flex items-center space-x-3">
                                {status === GenerationStatus.COMPLETED && (
                                    <button 
                                        onClick={() => toggleBatch(chunkIdx)}
                                        className="text-slate-400 hover:text-indigo-400 focus:outline-none"
                                    >
                                        {isSelected ? <CheckSquare className="w-5 h-5 text-indigo-400" /> : <Square className="w-5 h-5" />}
                                    </button>
                                )}
                                <div>
                                    <h3 className={`text-sm font-semibold ${isSelected ? 'text-indigo-300' : 'text-slate-300'}`}>
                                        Segment {chunkIdx + 1}
                                    </h3>
                                    <p className="text-xs text-slate-500 font-mono mt-0.5">{startTime} - {endTime}</p>
                                </div>
                            </div>
                            
                            {status === GenerationStatus.COMPLETED && (
                                <div className="flex items-center space-x-1">
                                    <button
                                        onClick={() => handleBatchAction('fix_timestamps', chunkIdx)}
                                        title="Fix Time"
                                        className="p-2 text-slate-500 hover:text-emerald-400 hover:bg-slate-700 rounded-lg transition-colors"
                                    >
                                        <Clock className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => handleBatchAction('proofread', chunkIdx)}
                                        title="Deep Proofread"
                                        className="p-2 text-slate-500 hover:text-indigo-400 hover:bg-slate-700 rounded-lg transition-colors"
                                    >
                                        <Wand2 className="w-4 h-4" />
                                    </button>
                                </div>
                            )}
                        </div>
                        
                        {/* List Items */}
                        <div className="divide-y divide-slate-800/50">
                            {chunk.map((sub) => (
                                <div key={sub.id} className="p-3 hover:bg-slate-800/30 transition-colors flex items-start space-x-4">
                                    <div className="text-[10px] font-mono text-slate-600 min-w-[50px] pt-2">
                                        {(sub.startTime || '').split(',')[0]}
                                    </div>
                                    <div className="flex-1 space-y-1">
                                        {showSourceText && (
                                            <p className="text-sm text-slate-400 leading-relaxed opacity-70 mb-1">{sub.original}</p>
                                        )}
                                        <p className="text-lg text-indigo-300 leading-relaxed font-medium">{sub.translated}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
  };

  const StatusBadge = () => {
    switch (status) {
      case GenerationStatus.PROCESSING:
      case GenerationStatus.UPLOADING:
        return (
          <div className="flex items-center space-x-2 text-blue-400 bg-blue-400/10 px-4 py-2 rounded-full animate-pulse">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm font-medium">{progressMsg || 'Processing...'}</span>
          </div>
        );
      case GenerationStatus.PROOFREADING:
        return (
          <div className="flex items-center space-x-2 text-purple-400 bg-purple-400/10 px-4 py-2 rounded-full animate-pulse">
            <Sparkles className="w-4 h-4 animate-spin" />
            <span className="text-sm font-medium">{progressMsg || 'Polishing...'}</span>
          </div>
        );
      case GenerationStatus.COMPLETED:
        return (
          <div className="flex items-center space-x-2 text-emerald-400 bg-emerald-400/10 px-4 py-2 rounded-full">
            <CheckCircle className="w-4 h-4" />
            <span className="text-sm font-medium">Complete</span>
          </div>
        );
      case GenerationStatus.ERROR:
        return (
          <div className="flex items-center space-x-2 text-red-400 bg-red-400/10 px-4 py-2 rounded-full">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm font-medium">Error</span>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header */}
        <header className="flex justify-between items-center pb-6 border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg shadow-indigo-500/20">
              <Languages className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Gemini Subtitle Pro</h1>
              <p className="text-sm text-slate-400">OpenAI Transcription + Gemini 2.5 Refine</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <button 
              onClick={() => setShowSettings(true)}
              className="flex items-center space-x-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors text-sm font-medium group"
            >
              <Settings className="w-4 h-4 text-slate-400 group-hover:text-emerald-400 transition-colors" />
              <span className="hidden sm:inline">Settings</span>
            </button>
            <button 
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center space-x-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors text-sm font-medium"
            >
              <History className="w-4 h-4" />
              <span className="hidden sm:inline">History</span>
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left Column: Upload & Controls */}
          <div className="lg:col-span-1 space-y-6">
            
            {/* Upload Card */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 shadow-xl backdrop-blur-sm">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center">
                <Upload className="w-5 h-5 mr-2 text-indigo-400" />
                Upload Media
              </h2>
              
              <div className="relative group">
                <input 
                  type="file" 
                  accept="video/*,audio/*" 
                  onChange={handleFileChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  disabled={isProcessing}
                />
                <div className={`
                  border-2 border-dashed rounded-xl p-8 text-center transition-all duration-300
                  ${file ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-slate-700 hover:border-indigo-500/50 hover:bg-indigo-500/5'}
                `}>
                  <div className="flex justify-center mb-4">
                    {file ? (
                      <FileVideo className="w-12 h-12 text-emerald-400" />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center">
                         <Upload className="w-6 h-6 text-slate-400 group-hover:text-indigo-400" />
                      </div>
                    )}
                  </div>
                  {file ? (
                    <div>
                      <p className="text-emerald-400 font-medium truncate max-w-[200px] mx-auto">{file.name}</p>
                      <p className="text-xs text-slate-500 mt-1">
                        {(file.size / (1024*1024)).toFixed(2)} MB
                        {duration > 0 && ` • ${Math.floor(duration / 60)}:${Math.floor(duration % 60).toString().padStart(2,'0')}`}
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-slate-300 font-medium">Click or drag video/audio</p>
                      <p className="text-xs text-slate-500 mt-2">Supports MP4, MP3, WAV, MKV</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Genre Display */}
              <div className="mt-4 flex items-center justify-between text-xs text-slate-400 bg-slate-800/50 p-2 rounded-lg border border-slate-700/50">
                  <span className="flex items-center"><Monitor className="w-3 h-3 mr-1" /> Model: <span className="text-indigo-300 ml-1">{settings.transcriptionModel}</span></span>
                  <span className="flex items-center"><Clapperboard className="w-3 h-3 mr-1" /> Genre: <span className="text-indigo-300 ml-1 capitalize">{settings.genre}</span></span>
              </div>

              <div className="mt-4">
                <button
                  onClick={handleGenerate}
                  disabled={isProcessing}
                  className={`
                    w-full py-3 px-4 rounded-xl font-semibold text-white shadow-lg transition-all
                    flex items-center justify-center space-x-2
                    ${isProcessing
                      ? 'bg-slate-700 text-slate-400 cursor-wait' 
                      : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 shadow-indigo-500/25 hover:shadow-indigo-500/40 cursor-pointer'
                    }
                  `}
                >
                  {isProcessing ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Play className="w-5 h-5 fill-current" />
                  )}
                  <span>{status === GenerationStatus.IDLE || status === GenerationStatus.COMPLETED || status === GenerationStatus.ERROR ? 'Start Processing' : 'Processing...'}</span>
                </button>
              </div>

              {error && (
                <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400 flex items-start space-x-2 animate-fade-in">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span className="break-words w-full">{error}</span>
                </div>
              )}
            </div>

            {/* Download Options */}
            {(status === GenerationStatus.COMPLETED || status === GenerationStatus.PROOFREADING) && (
              <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 shadow-xl animate-fade-in">
                <h2 className="text-lg font-semibold text-white mb-4 flex items-center">
                  <Download className="w-5 h-5 mr-2 text-emerald-400" />
                  Download ({settings.outputMode === 'bilingual' ? 'Bilingual' : 'Chinese Only'})
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => handleDownload('srt')} className="flex items-center justify-center space-x-2 p-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 rounded-lg transition-all">
                    <span className="font-bold text-slate-200">.SRT</span>
                    <span className="text-xs text-slate-500">Universal</span>
                  </button>
                  <button onClick={() => handleDownload('ass')} className="flex items-center justify-center space-x-2 p-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 rounded-lg transition-all">
                    <span className="font-bold text-slate-200">.ASS</span>
                    <span className="text-xs text-slate-500">Styled</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Preview & History */}
          <div className="lg:col-span-2 flex flex-col">
            
            {/* Status Bar */}
            <div className="flex items-center justify-between mb-4 h-10">
              <div className="flex items-center space-x-3">
                <h2 className="text-lg font-semibold text-white">
                  {showHistory ? 'History' : 'Subtitle Preview'}
                </h2>
              </div>
              <StatusBadge />
            </div>

            {/* Main Content Area */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden flex flex-col shadow-2xl relative h-[600px] my-12 items-start">
              {showHistory ? (
                <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar w-full">
                  {history.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-500 opacity-50">
                      <History className="w-12 h-12 mb-2" />
                      <p>No history yet</p>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-end mb-2">
                         <button onClick={clearHistory} className="text-xs text-red-400 hover:text-red-300 flex items-center">
                           <Trash2 className="w-3 h-3 mr-1" /> Clear All
                         </button>
                      </div>
                      {history.map((item) => (
                        <div 
                          key={item.id} 
                          onClick={() => loadFromHistory(item)}
                          className="bg-slate-800/50 hover:bg-slate-800 border border-slate-700 hover:border-indigo-500/50 p-4 rounded-xl cursor-pointer transition-all group"
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <h4 className="font-medium text-slate-200 group-hover:text-indigo-300 transition-colors">{item.fileName}</h4>
                              <p className="text-xs text-slate-500 mt-1">{item.date}</p>
                            </div>
                            <span className="text-xs bg-slate-700 px-2 py-1 rounded text-slate-400">
                              {item.subtitles.length} lines
                            </span>
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto custom-scrollbar relative w-full" ref={(el) => { if (el && status === GenerationStatus.PROCESSING) el.scrollTop = el.scrollHeight; }}>
                   {renderSubtitleList()}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-3xl shadow-2xl relative my-12">
            <button 
              onClick={() => setShowSettings(false)} 
              className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            
            <h2 className="text-xl font-bold text-white mb-6 flex items-center">
              <Settings className="w-5 h-5 mr-2 text-indigo-400" />
              Settings
            </h2>

            <div className="space-y-6">
              
              {/* API Keys Section */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">API Configuration</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1.5">Gemini API Key</label>
                      <div className="relative">
                        <input 
                          type={showGeminiKey ? "text" : "password"}
                          value={settings.geminiKey}
                          onChange={(e) => updateSetting('geminiKey', e.target.value.trim())}
                          placeholder="Enter Gemini API Key"
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2.5 pl-3 pr-10 text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm"
                        />
                        <button onClick={() => setShowGeminiKey(!showGeminiKey)} className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300">
                          {showGeminiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1.5">OpenAI API Key</label>
                      <div className="relative">
                        <input 
                          type={showOpenAIKey ? "text" : "password"}
                          value={settings.openaiKey}
                          onChange={(e) => updateSetting('openaiKey', e.target.value.trim())}
                          placeholder="Enter OpenAI API Key"
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2.5 pl-3 pr-10 text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm"
                        />
                         <button onClick={() => setShowOpenAIKey(!showOpenAIKey)} className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300">
                          {showOpenAIKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                </div>
              </div>

              {/* Model & Genre Section */}
              <div className="space-y-3 pt-4 border-t border-slate-800">
                 <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Transcription & Style</h3>
                 
                 <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1.5">Transcription Model</label>
                      <div className="relative">
                        <AudioLines className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                        <select 
                          value={settings.transcriptionModel}
                          onChange={(e) => updateSetting('transcriptionModel', e.target.value)}
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 pl-9 pr-3 text-slate-200 focus:outline-none focus:border-indigo-500 text-sm appearance-none"
                        >
                          <option value="whisper-1">Whisper (Standard)</option>
                          <option value="gpt-4o-audio-preview">GPT-4o Audio</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1.5">Genre / Context</label>
                      <div className="relative">
                        <Clapperboard className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                        <select 
                          value={isCustomGenre ? 'custom' : settings.genre}
                          onChange={(e) => {
                              const val = e.target.value;
                              if (val === 'custom') {
                                  updateSetting('genre', '');
                              } else {
                                  updateSetting('genre', val);
                              }
                          }}
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 pl-9 pr-3 text-slate-200 focus:outline-none focus:border-indigo-500 text-sm appearance-none"
                        >
                          <option value="general">General</option>
                          <option value="anime">Anime / Animation</option>
                          <option value="movie">Movies / TV Series</option>
                          <option value="news">News / Documentary</option>
                          <option value="tech">Tech / Education</option>
                          <option value="custom">Custom...</option>
                        </select>
                      </div>
                      {/* Conditional Custom Input */}
                      {isCustomGenre && (
                          <div className="mt-2 animate-fade-in">
                              <input
                                  type="text"
                                  value={settings.genre}
                                  onChange={(e) => updateSetting('genre', e.target.value)}
                                  placeholder="E.g., Minecraft Gameplay, Medical Lecture..."
                                  className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-slate-200 focus:outline-none focus:border-indigo-500 text-sm placeholder-slate-600"
                                  autoFocus
                              />
                          </div>
                      )}
                    </div>
                 </div>
              </div>

               {/* Output Mode Section */}
               <div className="space-y-3 pt-4 border-t border-slate-800">
                 <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">File Output Options</h3>
                 
                 <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">Export Mode</label>
                    <div className="grid grid-cols-2 gap-3">
                        <button
                            onClick={() => updateSetting('outputMode', 'bilingual')}
                            className={`p-3 rounded-lg border text-sm flex items-center justify-center space-x-2 transition-all ${settings.outputMode === 'bilingual' ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-750'}`}
                        >
                            <Languages className="w-4 h-4" />
                            <span>Bilingual (Orig + CN)</span>
                        </button>
                         <button
                            onClick={() => updateSetting('outputMode', 'target_only')}
                            className={`p-3 rounded-lg border text-sm flex items-center justify-center space-x-2 transition-all ${settings.outputMode === 'target_only' ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-750'}`}
                        >
                            <Type className="w-4 h-4" />
                            <span>Chinese Only</span>
                        </button>
                    </div>
                    <p className="text-xs text-slate-500 mt-2">
                        Controls the content of the downloaded .SRT / .ASS files. "Bilingual" includes original text.
                    </p>
                 </div>
              </div>

              {/* Custom Prompts Section */}
              <div className="space-y-3 pt-4 border-t border-slate-800">
                 <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center">
                    <MessageSquareText className="w-4 h-4 mr-1.5" />
                    Custom Prompts (Optional)
                 </h3>
                 <p className="text-xs text-slate-500 mb-2">Leave blank to use the default prompts for the selected genre.</p>

                 <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Translation Prompt</label>
                    <textarea 
                        value={settings.customTranslationPrompt}
                        onChange={(e) => updateSetting('customTranslationPrompt', e.target.value)}
                        placeholder="Override system instruction for initial translation..."
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-slate-200 text-xs focus:outline-none focus:border-indigo-500 h-20 resize-none"
                    />
                 </div>
                 
                 <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Proofreading Prompt</label>
                    <textarea 
                        value={settings.customProofreadingPrompt}
                        onChange={(e) => updateSetting('customProofreadingPrompt', e.target.value)}
                        placeholder="Override system instruction for proofreading..."
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-slate-200 text-xs focus:outline-none focus:border-indigo-500 h-20 resize-none"
                    />
                 </div>
              </div>

              <div className="pt-4">
                <button 
                  onClick={() => setShowSettings(false)}
                  className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-medium py-2.5 rounded-lg shadow-lg shadow-indigo-500/25 transition-all"
                >
                  Save Configuration
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
