import React from 'react';
import { CheckSquare, Square, Wand2 } from 'lucide-react';
import { SubtitleItem } from '@/types';
import { SubtitleRow } from './SubtitleRow';
import { GenerationStatus } from '@/types/api';

interface SubtitleBatchProps {
    chunk: SubtitleItem[];
    chunkIdx: number;
    isSelected: boolean;
    status: GenerationStatus; // We need to import this enum or use string
    batchComment: string;
    toggleBatch: (index: number) => void;
    updateBatchComment: (index: number, comment: string) => void;
    handleBatchAction: (action: 'proofread' | 'fix_timestamps', index?: number) => void;
    showSourceText: boolean;
    editingCommentId: number | null;
    setEditingCommentId: (id: number | null) => void;
    updateLineComment: (id: number, comment: string) => void;
}

export const SubtitleBatch: React.FC<SubtitleBatchProps> = React.memo(({
    chunk,
    chunkIdx,
    isSelected,
    status,
    batchComment,
    toggleBatch,
    updateBatchComment,
    handleBatchAction,
    showSourceText,
    editingCommentId,
    setEditingCommentId,
    updateLineComment
}) => {
    const startTime = chunk[0].startTime.split(',')[0];
    const endTime = chunk[chunk.length - 1].endTime.split(',')[0];

    return (
        <div className={`border rounded-xl overflow-hidden transition-all ${isSelected ? 'border-indigo-500/50 bg-indigo-500/5' : 'border-slate-700/50 bg-slate-900/40'}`}>
            <div className={`px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${isSelected ? 'bg-indigo-900/20' : 'bg-slate-800/50'}`}>
                <div className="flex items-center space-x-3">
                    {status === GenerationStatus.COMPLETED && (
                        <button onClick={() => toggleBatch(chunkIdx)} className="text-slate-400 hover:text-indigo-400 focus:outline-none">
                            {isSelected ? <CheckSquare className="w-5 h-5 text-indigo-400" /> : <Square className="w-5 h-5" />}
                        </button>
                    )}
                    <div>
                        <h3 className={`text-sm font-semibold ${isSelected ? 'text-indigo-300' : 'text-slate-300'}`}>片段 {chunkIdx + 1}</h3>
                        <p className="text-xs text-slate-500 font-mono mt-0.5">{startTime} - {endTime}</p>
                    </div>
                </div>
                <div className="flex-1 px-2">
                    <input
                        type="text"
                        value={batchComment}
                        onChange={(e) => updateBatchComment(chunkIdx, e.target.value)}
                        placeholder="添加说明或注释..."
                        className="w-full bg-slate-900/50 border border-slate-700/50 rounded px-2 py-1 text-xs text-amber-200 placeholder-slate-600 focus:border-amber-500/50 focus:outline-none"
                    />
                </div>
                {status === GenerationStatus.COMPLETED && (
                    <div className="flex items-center space-x-1">
                        <button onClick={() => handleBatchAction('proofread', chunkIdx)} title="深度校对" className="p-2 text-slate-500 hover:text-indigo-400 hover:bg-slate-700 rounded-lg transition-colors">
                            <Wand2 className="w-4 h-4" />
                        </button>
                    </div>
                )}
            </div>
            <div className="divide-y divide-slate-800/50">
                {chunk.map((sub) => (
                    <SubtitleRow
                        key={sub.id}
                        sub={sub}
                        showSourceText={showSourceText}
                        editingCommentId={editingCommentId}
                        setEditingCommentId={setEditingCommentId}
                        updateLineComment={updateLineComment}
                    />
                ))}
            </div>
        </div>
    );
}, (prev, next) => {
    return (
        prev.chunk === next.chunk &&
        prev.isSelected === next.isSelected &&
        prev.status === next.status &&
        prev.batchComment === next.batchComment &&
        prev.showSourceText === next.showSourceText &&
        prev.editingCommentId === next.editingCommentId
    );
});
