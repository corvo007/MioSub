import React from 'react';
import { Languages } from 'lucide-react';
import { SubtitleItem } from '@/types';
import { GenerationStatus } from '@/types/api';
import { SubtitleBatch } from './SubtitleBatch';
import { BatchHeader } from './BatchHeader';

interface SubtitleEditorProps {
    subtitles: SubtitleItem[];
    settings: any; // Ideally typed as AppSettings
    status: GenerationStatus;
    activeTab: string;
    selectedBatches: Set<number>;
    toggleAllBatches: (total: number) => void;
    selectBatchesWithComments: (chunks: SubtitleItem[][]) => void;
    showSourceText: boolean;
    setShowSourceText: (show: boolean) => void;
    file: File | null;
    handleBatchAction: (action: 'proofread' | 'fix_timestamps', index?: number) => void;
    batchComments: Record<number, string>;
    toggleBatch: (index: number) => void;
    updateBatchComment: (index: number, comment: string) => void;
    editingCommentId: number | null;
    setEditingCommentId: (id: number | null) => void;
    updateLineComment: (id: number, comment: string) => void;
}

export const SubtitleEditor: React.FC<SubtitleEditorProps> = React.memo(({
    subtitles,
    settings,
    status,
    activeTab,
    selectedBatches,
    toggleAllBatches,
    selectBatchesWithComments,
    showSourceText,
    setShowSourceText,
    file,
    handleBatchAction,
    batchComments,
    toggleBatch,
    updateBatchComment,
    editingCommentId,
    setEditingCommentId,
    updateLineComment
}) => {
    const chunks: SubtitleItem[][] = [];
    const batchSize = settings.proofreadBatchSize || 20;
    for (let i = 0; i < subtitles.length; i += batchSize) {
        chunks.push(subtitles.slice(i, i + batchSize));
    }

    if (chunks.length === 0) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-slate-600 p-8 min-h-[300px]">
                <div className="w-16 h-16 border-2 border-slate-700 border-dashed rounded-full flex items-center justify-center mb-4">
                    <Languages className="w-6 h-6" />
                </div>
                <p className="font-medium">暂无生成字幕</p>
                <p className="text-sm mt-2 max-w-xs text-center opacity-70">
                    {activeTab === 'new' ? '上传媒体文件开始生成。' : '导入 SRT/ASS 文件开始编辑。'}
                </p>
            </div>
        );
    }

    return (
        <div className="p-4 space-y-6 pb-20">
            {status === GenerationStatus.COMPLETED && (
                <BatchHeader
                    chunks={chunks}
                    selectedBatches={selectedBatches}
                    toggleAllBatches={toggleAllBatches}
                    selectBatchesWithComments={selectBatchesWithComments}
                    showSourceText={showSourceText}
                    setShowSourceText={setShowSourceText}
                    file={file}
                    handleBatchAction={handleBatchAction}
                />
            )}

            {chunks.map((chunk, chunkIdx) => (
                <SubtitleBatch
                    key={chunkIdx}
                    chunk={chunk}
                    chunkIdx={chunkIdx}
                    isSelected={selectedBatches.has(chunkIdx)}
                    status={status}
                    batchComment={batchComments[chunkIdx] || ''}
                    toggleBatch={toggleBatch}
                    updateBatchComment={updateBatchComment}
                    handleBatchAction={handleBatchAction}
                    showSourceText={showSourceText}
                    editingCommentId={editingCommentId}
                    setEditingCommentId={setEditingCommentId}
                    updateLineComment={updateLineComment}
                />
            ))}
        </div>
    );
}, (prev, next) => {
    return (
        prev.subtitles === next.subtitles &&
        prev.settings === next.settings &&
        prev.status === next.status &&
        prev.activeTab === next.activeTab &&
        prev.selectedBatches === next.selectedBatches &&
        prev.showSourceText === next.showSourceText &&
        prev.file === next.file &&
        prev.batchComments === next.batchComments &&
        prev.editingCommentId === next.editingCommentId
    );
});
