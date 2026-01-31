import React from 'react';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import { SubtitleBatch } from '@/components/editor/SubtitleBatch';
import { type SubtitleItem } from '@/types';
import type { GenerationStatus } from '@/types/api';
import { useWorkspaceStore, selectSubtitleState, selectUIState } from '@/store/useWorkspaceStore';
import { useShallow } from 'zustand/react/shallow';

interface SubtitleBatchListProps {
  chunks: SubtitleItem[][];
  status: GenerationStatus;
  virtuosoRef: React.RefObject<VirtuosoHandle>;
  // Callbacks
  checkDelete: (id: string) => void;

  // State
  isDeleteMode: boolean;
  selectedForDelete: Set<string>;
  toggleDeleteSelection: (id: string) => void;
  currentPlayTime?: number;
  onRowClick?: (startTime: string) => void;
}

export const SubtitleBatchList: React.FC<SubtitleBatchListProps> = React.memo(
  ({
    chunks,
    status,
    virtuosoRef,
    checkDelete,

    isDeleteMode,
    selectedForDelete,
    toggleDeleteSelection,
    currentPlayTime,
    onRowClick,
  }) => {
    // Store Connectors
    const { subtitles } = useWorkspaceStore(useShallow(selectSubtitleState));
    const speakerProfiles = useWorkspaceStore(useShallow((s) => s.speakerProfiles));
    const { selectedBatches, batchComments } = useWorkspaceStore(useShallow(selectUIState));
    const actions = useWorkspaceStore((s) => s.actions);

    const { toggleBatch, updateBatchComment, handleBatchAction } = actions;

    // Pre-calculate chunk start indices for accurate global index calculation
    const chunkStartIndices = React.useMemo(() => {
      const indices: number[] = [];
      let runningIndex = 0;
      for (const chunk of chunks) {
        indices.push(runningIndex);
        runningIndex += chunk.length;
      }
      return indices;
    }, [chunks]);

    return (
      <div className="flex-1 min-h-0">
        <Virtuoso
          ref={virtuosoRef}
          style={{ height: '100%' }}
          data={chunks}
          context={{ speakerProfiles }}
          itemContent={(chunkIdx, chunk) => (
            <div className="mb-6">
              <SubtitleBatch
                key={chunkIdx}
                chunk={chunk}
                chunkIdx={chunkIdx}
                chunkStartIndex={chunkStartIndices[chunkIdx] ?? 0}
                isSelected={selectedBatches.has(chunkIdx)}
                status={status}
                batchComment={batchComments[String(chunkIdx)] || ''}
                toggleBatch={toggleBatch}
                updateBatchComment={updateBatchComment}
                handleBatchAction={handleBatchAction}
                deleteSubtitle={checkDelete}
                subtitles={subtitles}
                isDeleteMode={isDeleteMode}
                selectedForDelete={selectedForDelete}
                onToggleDeleteSelection={toggleDeleteSelection}
                currentPlayTime={currentPlayTime}
                onRowClick={onRowClick}
              />
            </div>
          )}
        />
      </div>
    );
  }
);
