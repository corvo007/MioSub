import { useState, useCallback } from 'react';
import { SubtitleItem } from '@/types/subtitle';

export function useBatchSelection() {
  const [selectedBatches, setSelectedBatches] = useState<Set<number>>(new Set());
  const [batchComments, setBatchComments] = useState<Record<string, string>>({});
  const [showSourceText, setShowSourceText] = useState(true);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);

  const toggleBatch = useCallback((index: number) => {
    setSelectedBatches((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(index)) newSet.delete(index);
      else newSet.add(index);
      return newSet;
    });
  }, []);

  const toggleAllBatches = useCallback((totalBatches: number) => {
    setSelectedBatches((prev) => {
      if (prev.size === totalBatches) return new Set();
      return new Set(Array.from({ length: totalBatches }, (_, i) => i));
    });
  }, []);

  const selectBatchesWithComments = useCallback(
    (chunks: SubtitleItem[][]) => {
      const newSet = new Set<number>();
      chunks.forEach((chunk, idx) => {
        const hasBatchComment =
          batchComments[String(idx)] && batchComments[String(idx)].trim().length > 0;
        const hasLineComments = chunk.some((s) => s.comment && s.comment.trim().length > 0);
        if (hasBatchComment || hasLineComments) newSet.add(idx);
      });
      setSelectedBatches(newSet);
    },
    [batchComments]
  );

  const updateBatchComment = useCallback((index: number, comment: string) => {
    setBatchComments((prev) => ({ ...prev, [String(index)]: comment }));
  }, []);

  const resetBatchState = useCallback(() => {
    setBatchComments({});
    setSelectedBatches(new Set());
  }, []);

  return {
    selectedBatches,
    setSelectedBatches,
    batchComments,
    setBatchComments,
    showSourceText,
    setShowSourceText,
    editingCommentId,
    setEditingCommentId,
    toggleBatch,
    toggleAllBatches,
    selectBatchesWithComments,
    updateBatchComment,
    resetBatchState,
  };
}
