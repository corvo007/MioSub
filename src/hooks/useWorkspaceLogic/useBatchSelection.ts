import { useCallback } from 'react';
import type React from 'react';
import { type SubtitleItem } from '@/types/subtitle';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';

export function useBatchSelection() {
  const toggleBatch = useCallback((index: number) => {
    useWorkspaceStore.setState((state) => {
      const newSet = new Set(state.selectedBatches);
      if (newSet.has(index)) newSet.delete(index);
      else newSet.add(index);
      return { selectedBatches: newSet };
    });
  }, []);

  const toggleAllBatches = useCallback((totalBatches: number) => {
    useWorkspaceStore.setState((state) => {
      if (state.selectedBatches.size === totalBatches) return { selectedBatches: new Set() };
      return { selectedBatches: new Set(Array.from({ length: totalBatches }, (_, i) => i)) };
    });
  }, []);

  const selectBatchesWithComments = useCallback((chunks: SubtitleItem[][]) => {
    const state = useWorkspaceStore.getState();
    const newSet = new Set<number>();
    chunks.forEach((chunk, idx) => {
      const hasBatchComment =
        state.batchComments[String(idx)] && state.batchComments[String(idx)].trim().length > 0;
      const hasLineComments = chunk.some((s) => s.comment && s.comment.trim().length > 0);
      if (hasBatchComment || hasLineComments) newSet.add(idx);
    });
    useWorkspaceStore.setState({ selectedBatches: newSet });
  }, []);

  const updateBatchComment = useCallback((index: number, comment: string) => {
    useWorkspaceStore.setState((state) => ({
      batchComments: { ...state.batchComments, [numberToString(index)]: comment },
    }));
  }, []);

  const resetBatchState = useCallback(() => {
    useWorkspaceStore.setState({
      batchComments: {},
      selectedBatches: new Set(),
    });
  }, []);

  const setEditingCommentId = useCallback((id: string | null) => {
    useWorkspaceStore.setState({ editingCommentId: id });
  }, []);

  const setShowSourceText = useCallback((show: boolean) => {
    useWorkspaceStore.setState({ showSourceText: show });
  }, []);

  const setSelectedBatches = useCallback((batches: Set<number>) => {
    useWorkspaceStore.setState({ selectedBatches: batches });
  }, []);

  const setBatchComments = useCallback((comments: React.SetStateAction<Record<string, string>>) => {
    useWorkspaceStore.setState((state) => {
      const newComments =
        typeof comments === 'function' ? (comments as any)(state.batchComments) : comments;
      return { batchComments: newComments };
    });
  }, []);

  return {
    toggleBatch,
    toggleAllBatches,
    selectBatchesWithComments,
    updateBatchComment,
    resetBatchState,
    setEditingCommentId,
    setShowSourceText,
    setSelectedBatches,
    setBatchComments,
  };
}

// Helper to handle key conversion. Using string keys for consistency with Record<string, string>.
function numberToString(n: number): string {
  return String(n);
}
