import React from 'react';
import { CheckSquare, Square, MessageCircle, Eye, EyeOff, Clock, Sparkles } from 'lucide-react';
import { SubtitleItem } from '@/types';

interface BatchHeaderProps {
    chunks: SubtitleItem[][];
    selectedBatches: Set<number>;
    toggleAllBatches: (total: number) => void;
    selectBatchesWithComments: (chunks: SubtitleItem[][]) => void;
    showSourceText: boolean;
    setShowSourceText: (show: boolean) => void;
    file: File | null;
    handleBatchAction: (action: 'proofread' | 'fix_timestamps', index?: number) => void;
}

export const BatchHeader: React.FC<BatchHeaderProps> = ({
    chunks,
    selectedBatches,
    toggleAllBatches,
    selectBatchesWithComments,
    showSourceText,
    setShowSourceText,
    file,
    handleBatchAction
}) => {
    return (
        <div className="flex flex-wrap items-center gap-3 bg-slate-800/90 p-3 rounded-lg border border-slate-700 sticky top-0 z-20 backdrop-blur-md shadow-md justify-between">
            <div className="flex items-center space-x-4">
                <button onClick={() => toggleAllBatches(chunks.length)} className="flex items-center space-x-2 text-sm text-slate-300 hover:text-white transition-colors">
                    {selectedBatches.size === chunks.length ? <CheckSquare className="w-4 h-4 text-indigo-400" /> : <Square className="w-4 h-4 text-slate-500" />}
                    <span>{selectedBatches.size === chunks.length ? '取消全选' : '全选'}</span>
                </button>
                <button onClick={() => selectBatchesWithComments(chunks)} className="flex items-center space-x-2 text-sm text-slate-300 hover:text-white transition-colors" title="选择带评论项">
                    <MessageCircle className="w-4 h-4 text-amber-400" /><span className="hidden sm:inline">选择带评论项</span>
                </button>
                <button onClick={() => setShowSourceText(!showSourceText)} className="flex items-center space-x-2 text-sm text-slate-400 hover:text-white transition-colors">
                    {showSourceText ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}<span className="hidden sm:inline">{showSourceText ? "隐藏原文" : "显示原文"}</span>
                </button>
            </div>
            <div className="flex items-center space-x-2">
                <div className="text-xs text-slate-500 font-mono mr-2 hidden sm:block">已选 {selectedBatches.size} 项</div>
                {file && (
                    <button onClick={() => handleBatchAction('fix_timestamps')} disabled={selectedBatches.size === 0} title="修复时间轴 (保留翻译)" className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all shadow-sm border ${selectedBatches.size > 0 ? 'bg-slate-700 border-slate-600 text-emerald-400 hover:bg-slate-600 hover:border-emerald-400/50' : 'bg-slate-800 border-slate-800 text-slate-600 cursor-not-allowed'}`}>
                        <Clock className="w-3 h-3" /><span className="hidden sm:inline">修复时间</span>
                    </button>
                )}

                <button onClick={() => handleBatchAction('proofread')} disabled={selectedBatches.size === 0} title="校对翻译 (保留时间轴)" className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all shadow-sm border ${selectedBatches.size > 0 ? 'bg-indigo-600 border-indigo-500 text-white hover:bg-indigo-500' : 'bg-slate-800 border-slate-800 text-slate-600 cursor-not-allowed'}`}>
                    <Sparkles className="w-3 h-3" /><span className="hidden sm:inline">校对</span>
                </button>
            </div>
        </div>
    );
};
