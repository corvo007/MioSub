import React from 'react';
import { Loader2, Sparkles, CheckCircle } from 'lucide-react';
import { GenerationStatus, ChunkStatus } from '@/types/api';
import { TimeTracker } from './TimeTracker';

interface ProgressOverlayProps {
    isProcessing: boolean;
    chunkProgress: Record<string | number, ChunkStatus>;
    status: GenerationStatus;
    startTime: number;
}

export const ProgressOverlay: React.FC<ProgressOverlayProps> = ({
    isProcessing,
    chunkProgress,
    status,
    startTime
}) => {
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

    const systemChunks = chunks.filter(c => ['decoding', 'segmenting', 'glossary'].includes(String(c.id)));
    const contentChunks = chunks.filter(c => !['init', 'decoding', 'segmenting', 'glossary'].includes(String(c.id)));

    const contentTotal = contentChunks.length > 0 ? contentChunks[0].total : 0;
    const contentCompleted = contentChunks.filter(c => c.status === 'completed').length;

    const systemTotal = systemChunks.length;
    const systemCompleted = systemChunks.filter(c => c.status === 'completed').length;

    const total = contentTotal + systemTotal;
    const completed = contentCompleted + systemCompleted;

    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-[600px] max-h-[80vh] flex flex-col shadow-2xl animate-in fade-in zoom-in duration-200">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold text-white flex items-center">
                        {status === GenerationStatus.PROOFREADING ? <Sparkles className="w-5 h-5 mr-2 text-purple-400 animate-pulse" /> : <Loader2 className="w-5 h-5 mr-2 text-blue-400 animate-spin" />}
                        {status === GenerationStatus.PROOFREADING ? '批量校对中...' : '正在生成字幕...'}
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
                    {chunks.length === 0 && <div className="text-center text-slate-500 py-8">准备中...</div>}
                    {chunks.map(chunk => (
                        <div key={chunk.id} className="flex items-center justify-between bg-slate-800/80 p-3 rounded-lg border border-slate-700/50 hover:border-slate-600 transition-colors">
                            <div className="flex items-center space-x-3 min-w-[120px]">
                                <div className={`w-2 h-2 rounded-full ${chunk.status === 'completed' ? 'bg-emerald-500' : chunk.status === 'error' ? 'bg-red-500' : 'bg-blue-500 animate-pulse'}`} />
                                <span className="text-slate-300 text-sm font-medium">
                                    {typeof chunk.id === 'number'
                                        ? `片段 ${chunk.id}`
                                        : chunk.id === 'decoding' ? '解码音频'
                                            : chunk.id === 'segmenting' ? '分段处理'
                                                : chunk.id === 'glossary' ? '提取术语'
                                                    : chunk.id}
                                </span>
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
                        <span>进度</span>
                        <span>{completed}/{total} 已完成</span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden border border-slate-700/50">
                        <div className={`h-full transition-all duration-500 ease-out ${status === GenerationStatus.PROOFREADING ? 'bg-purple-500' : 'bg-blue-500'}`} style={{ width: `${percent}%` }}></div>
                    </div>
                </div>
            </div>
        </div>
    );
};
