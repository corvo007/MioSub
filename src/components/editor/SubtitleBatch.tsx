import React from 'react';
import { CheckSquare, Square, Wand2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { type SubtitleItem, type RegeneratePrompts } from '@/types';

import { SubtitleRow } from '@/components/editor/SubtitleRow';
import { GenerationStatus } from '@/types/api';
import { cn } from '@/lib/cn';

import { timeToSeconds } from '@/services/subtitle/time';

interface SubtitleBatchProps {
  chunk: SubtitleItem[];
  chunkIdx: number;
  isSelected: boolean;
  status: GenerationStatus;
  batchComment: string;
  toggleBatch: (index: number) => void;
  updateBatchComment: (index: number, comment: string) => void;
  handleBatchAction: (
    action: 'proofread' | 'regenerate',
    index?: number,
    prompts?: RegeneratePrompts
  ) => void;
  deleteSubtitle?: (id: string) => void;
  subtitles?: SubtitleItem[];
  batchSize?: number;
  // Delete mode
  isDeleteMode?: boolean;
  selectedForDelete?: Set<string>;
  onToggleDeleteSelection?: (id: string) => void;
  // Video sync
  currentPlayTime?: number;
  onRowClick?: (startTime: string) => void;
}

export const SubtitleBatch: React.FC<SubtitleBatchProps> = React.memo(
  ({
    chunk,
    chunkIdx,
    isSelected,
    status,
    batchComment,
    toggleBatch,
    updateBatchComment,
    handleBatchAction,
    deleteSubtitle,
    subtitles,
    batchSize = 20,
    // Delete mode
    isDeleteMode,
    selectedForDelete,
    onToggleDeleteSelection,
    // Video sync
    currentPlayTime,
    onRowClick,
  }) => {
    const { t } = useTranslation('workspace');
    const startTime = chunk[0].startTime.split(',')[0];
    const endTime = chunk[chunk.length - 1].endTime.split(',')[0];

    // Calculate the starting index of this chunk in the full subtitles array
    const chunkStartIndex = chunkIdx * batchSize;

    return (
      <div
        className={cn(
          'border rounded-xl overflow-hidden transition-all shadow-sm hover:shadow-md',
          isSelected
            ? 'border-brand-purple/30 bg-brand-purple/5 shadow-brand-purple/5'
            : 'border-slate-300 bg-white/50'
        )}
      >
        <div
          className={cn(
            'px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-t-xl',
            isSelected
              ? 'bg-brand-purple/10'
              : 'bg-slate-50/80 backdrop-blur-sm border-b border-slate-200'
          )}
        >
          <div className="flex items-center space-x-3">
            {/* Hide batch checkbox in delete mode */}
            {(status === GenerationStatus.COMPLETED || status === GenerationStatus.CANCELLED) &&
              !isDeleteMode && (
                <button
                  onClick={() => toggleBatch(chunkIdx)}
                  className="text-slate-400 hover:text-brand-purple focus:outline-none transition-colors"
                >
                  {isSelected ? (
                    <CheckSquare className="w-5 h-5 text-brand-purple" />
                  ) : (
                    <Square className="w-5 h-5 text-slate-300 hover:text-slate-500" />
                  )}
                </button>
              )}
            <div>
              <h3
                className={cn(
                  'text-sm font-semibold',
                  isSelected ? 'text-brand-purple-dark' : 'text-slate-700'
                )}
              >
                {t('batch.segment', { id: chunkIdx + 1 })}
              </h3>
              <p className="text-xs text-slate-500 font-mono mt-0.5">
                {startTime} - {endTime}
              </p>
            </div>
          </div>
          <div className="flex-1 px-2">
            <input
              type="text"
              value={batchComment}
              onChange={(e) => updateBatchComment(chunkIdx, e.target.value)}
              placeholder={t('batch.commentPlaceholder')}
              className="w-full bg-white border border-slate-200/80 rounded-lg px-3 py-1.5 text-xs text-slate-700 placeholder-slate-400 focus:border-brand-purple/50 focus:ring-1 focus:ring-brand-purple/20 focus:outline-none transition-all shadow-sm"
            />
          </div>
          {/* Hide proofread button in delete mode */}
          {(status === GenerationStatus.COMPLETED || status === GenerationStatus.CANCELLED) &&
            !isDeleteMode && (
              <div className="flex items-center space-x-1">
                <button
                  onClick={() => handleBatchAction('proofread', chunkIdx)}
                  title={t('batch.proofread')}
                  className="p-2 text-slate-500 hover:text-brand-purple hover:bg-brand-purple/10 rounded-lg transition-colors"
                >
                  <Wand2 className="w-4 h-4" />
                </button>
              </div>
            )}
        </div>
        <div className="divide-y divide-slate-200">
          {chunk.map((sub, indexInChunk) => {
            // Calculate global index and find previous subtitle's end time
            const globalIndex = chunkStartIndex + indexInChunk;
            const prevEndTime =
              globalIndex > 0 && subtitles ? subtitles[globalIndex - 1]?.endTime : undefined;

            return (
              <SubtitleRow
                key={sub.id}
                sub={sub}
                deleteSubtitle={deleteSubtitle}
                prevEndTime={prevEndTime}
                isDeleteMode={isDeleteMode}
                isSelectedForDelete={selectedForDelete?.has(sub.id)}
                onToggleDeleteSelection={onToggleDeleteSelection}
                currentPlayTime={currentPlayTime}
                onRowClick={onRowClick}
              />
            );
          })}
        </div>
      </div>
    );
  },
  (prev, next) => {
    // Basic props comparison
    const propsEqual =
      prev.chunk === next.chunk &&
      prev.isSelected === next.isSelected &&
      prev.status === next.status &&
      prev.batchComment === next.batchComment &&
      prev.subtitles === next.subtitles &&
      prev.deleteSubtitle === next.deleteSubtitle &&
      prev.isDeleteMode === next.isDeleteMode &&
      prev.selectedForDelete === next.selectedForDelete;

    if (!propsEqual) return false;

    // Time update optimization:
    // Only re-render if the time update affects this batch (is within range or was within range)
    if (prev.currentPlayTime === next.currentPlayTime) return true;

    // If we have no subtitles or invalid times, default to re-render if time changed (safest)
    if (!prev.chunk || prev.chunk.length === 0) return false;

    // Parse start/end of the batch
    const start = timeToSeconds(prev.chunk[0].startTime);
    const end = timeToSeconds(prev.chunk[prev.chunk.length - 1].endTime);

    // Check if time is/was relevant to this batch
    const wasInRange =
      prev.currentPlayTime !== undefined &&
      prev.currentPlayTime >= start &&
      prev.currentPlayTime <= end;
    const isInRange =
      next.currentPlayTime !== undefined &&
      next.currentPlayTime >= start &&
      next.currentPlayTime <= end;

    // If either is true, we need to render to update the highlighted row inside
    if (wasInRange || isInRange) return false;

    // Both are outside range -> No visual change -> No re-render
    return true;
  }
);
