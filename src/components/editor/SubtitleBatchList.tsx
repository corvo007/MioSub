import React from 'react';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import { SubtitleBatch } from '@/components/editor/SubtitleBatch';
import { type SubtitleItem } from '@/types';
import type { GenerationStatus } from '@/types/api';
import { useWorkspaceStore, selectSubtitleState, selectUIState } from '@/store/useWorkspaceStore';
import { useAppStore } from '@/store/useAppStore';
import { useShallow } from 'zustand/react/shallow';

interface SubtitleBatchListProps {
  chunks: SubtitleItem[][];
  status: GenerationStatus;
  virtuosoRef: React.RefObject<VirtuosoHandle>;
  // Callbacks
  checkDelete: (id: string) => void;
  onManageSpeakers: () => void;
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
    onManageSpeakers,
    isDeleteMode,
    selectedForDelete,
    toggleDeleteSelection,
    currentPlayTime,
    onRowClick,
  }) => {
    // Store Connectors
    const { subtitles } = useWorkspaceStore(useShallow(selectSubtitleState));
    const speakerProfiles = useWorkspaceStore(useShallow((s) => s.speakerProfiles));
    const { selectedBatches, batchComments, showSourceText, editingCommentId } = useWorkspaceStore(
      useShallow(selectUIState)
    );
    const actions = useWorkspaceStore((s) => s.actions);

    const {
      toggleBatch,
      updateBatchComment,
      handleBatchAction,
      setEditingCommentId,
      updateLineComment,
      updateSubtitleText,
      updateSubtitleOriginal,
      updateSubtitleTime,
      addSubtitle,
    } = actions;

    // Adapter for updateSpeaker to match signature
    const updateSpeaker = React.useCallback(
      (id: string, speaker: string, _applyToAll?: boolean) => {
        actions.updateSpeaker(id, speaker);
      },
      [actions]
    );

    // Batch size calculation
    // Priority: 1. Configured batch size (if available), 2. Infer from first chunk, 3. Default to 20
    const proofreadBatchSize = useAppStore(useShallow((s) => s.settings.proofreadBatchSize));
    const batchSize = proofreadBatchSize || (chunks.length > 0 ? chunks[0].length : 20);

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
                isSelected={selectedBatches.has(chunkIdx)}
                status={status}
                batchComment={batchComments[String(chunkIdx)] || ''}
                toggleBatch={toggleBatch}
                updateBatchComment={updateBatchComment}
                handleBatchAction={handleBatchAction}
                deleteSubtitle={checkDelete}
                subtitles={subtitles}
                batchSize={batchSize}
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
