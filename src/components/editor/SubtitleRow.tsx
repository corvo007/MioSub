import React from 'react';
import { MessageCircle } from 'lucide-react';
import { SubtitleItem } from '@/types';

interface SubtitleRowProps {
    sub: SubtitleItem;
    showSourceText: boolean;
    editingCommentId: number | null;
    setEditingCommentId: (id: number | null) => void;
    updateLineComment: (id: number, comment: string) => void;
}

export const SubtitleRow: React.FC<SubtitleRowProps> = React.memo(({
    sub,
    showSourceText,
    editingCommentId,
    setEditingCommentId,
    updateLineComment
}) => {
    return (
        <div className="p-3 hover:bg-slate-800/30 transition-colors flex items-start space-x-4 group/row">
            <div className="flex flex-col text-sm font-mono text-slate-400 min-w-[85px] pt-1">
                <span className="leading-tight">{(sub.startTime || '').split(',')[0]}</span>
                <span className="leading-tight opacity-70">{(sub.endTime || '').split(',')[0]}</span>
            </div>
            <div className="flex-1 space-y-1">
                {showSourceText && (
                    <p className="text-sm text-slate-400 leading-relaxed opacity-70 mb-1">
                        {sub.original}
                    </p>
                )}
                <p className="text-lg text-indigo-300 leading-relaxed font-medium">
                    {sub.translated}
                </p>
                {(editingCommentId === sub.id || sub.comment) && (
                    <div className="mt-2 flex items-start animate-fade-in">
                        <MessageCircle className="w-3 h-3 text-amber-500 mt-1 mr-2 flex-shrink-0" />
                        <input
                            type="text"
                            value={sub.comment || ''}
                            onChange={(e) => updateLineComment(sub.id, e.target.value)}
                            placeholder="添加具体修改说明..."
                            autoFocus={editingCommentId === sub.id}
                            onBlur={() => setEditingCommentId(null)}
                            className="w-full bg-amber-500/10 border border-amber-500/20 rounded px-2 py-1 text-sm text-amber-200 placeholder-amber-500/50 focus:outline-none focus:border-amber-500/50"
                        />
                    </div>
                )}
            </div>
            <button
                onClick={() => setEditingCommentId(sub.id)}
                className={`p-1.5 rounded hover:bg-slate-700 transition-colors ${sub.comment ? 'text-amber-400' : 'text-slate-600 opacity-0 group-hover/row:opacity-100'
                    }`}
                title="添加评论"
            >
                <MessageCircle className="w-4 h-4" />
            </button>
        </div>
    );
}, (prev, next) => {
    return (
        prev.sub === next.sub &&
        prev.showSourceText === next.showSourceText &&
        prev.editingCommentId === next.editingCommentId &&
        // Functions are usually stable if from useWorkspaceLogic, but if not, this might cause issues.
        // However, since we plan to memoize handlers in useWorkspaceLogic, strict equality check is fine.
        // But for editingCommentId, we only care if it matches THIS row's ID.
        (prev.editingCommentId === prev.sub.id) === (next.editingCommentId === next.sub.id)
    );
});
