import React from 'react';
import { Languages, Search } from 'lucide-react';
import { SubtitleItem } from '@/types';
import { SpeakerUIProfile } from '@/types/speaker';
import { GenerationStatus } from '@/types/api';
import { SubtitleBatch } from './SubtitleBatch';
import { SubtitleRow, validateSubtitle, parseTimeToSeconds } from './SubtitleRow';
import { BatchHeader, SubtitleFilters, defaultFilters } from './BatchHeader';
import { SimpleConfirmationModal } from '@/components/modals/SimpleConfirmationModal';
import { Virtuoso } from 'react-virtuoso';

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
  updateSubtitleText: (id: number, translated: string) => void;
  updateSubtitleOriginal: (id: number, original: string) => void;
  updateSpeaker: (id: number, speaker: string, applyToAll?: boolean) => void;
  updateSubtitleTime?: (id: number, startTime: string, endTime: string) => void;
  deleteSubtitle?: (id: number) => void;
  deleteMultipleSubtitles?: (ids: number[]) => void;
  speakerProfiles?: SpeakerUIProfile[];

  onManageSpeakers?: () => void;
  scrollContainerRef?: React.RefObject<HTMLDivElement>;
}

export const SubtitleEditor: React.FC<SubtitleEditorProps> = React.memo(
  ({
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
    updateLineComment,
    updateSubtitleText,
    updateSubtitleOriginal,
    updateSpeaker,
    updateSubtitleTime,
    deleteSubtitle,
    deleteMultipleSubtitles,
    speakerProfiles,

    onManageSpeakers,
    scrollContainerRef,
  }) => {
    const [searchQuery, setSearchQuery] = React.useState('');
    const [filters, setFilters] = React.useState<SubtitleFilters>(defaultFilters);
    const [deleteModalOpen, setDeleteModalOpen] = React.useState(false);
    const [deleteCandidateId, setDeleteCandidateId] = React.useState<number | null>(null);

    const checkDelete = React.useCallback((id: number) => {
      setDeleteCandidateId(id);
      setDeleteModalOpen(true);
    }, []);

    const confirmDelete = React.useCallback(() => {
      if (deleteCandidateId !== null && deleteSubtitle) {
        deleteSubtitle(deleteCandidateId);
      }
    }, [deleteCandidateId, deleteSubtitle]);

    // Delete mode state
    const [isDeleteMode, setIsDeleteMode] = React.useState(false);
    const [selectedForDelete, setSelectedForDelete] = React.useState<Set<number>>(new Set());
    const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = React.useState(false);

    const toggleDeleteMode = React.useCallback(() => {
      if (isDeleteMode) {
        setSelectedForDelete(new Set());
      }
      setIsDeleteMode(!isDeleteMode);
    }, [isDeleteMode]);

    const toggleDeleteSelection = React.useCallback((id: number) => {
      setSelectedForDelete((prev) => {
        const newSet = new Set(prev);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        return newSet;
      });
    }, []);

    // Calculate issue counts for filter dropdown
    const issueCounts = React.useMemo(() => {
      let duration = 0;
      let length = 0;
      let overlap = 0;

      subtitles.forEach((sub, index) => {
        const prevEndTime = index > 0 ? subtitles[index - 1].endTime : undefined;
        const validation = validateSubtitle(sub, prevEndTime);
        if (validation.hasDurationIssue) duration++;
        if (validation.hasLengthIssue) length++;
        if (validation.hasOverlapIssue) overlap++;
      });

      return { duration, length, overlap };
    }, [subtitles]);

    // Calculate speaker counts
    const speakerCounts = React.useMemo(() => {
      const counts: Record<string, number> = {};
      subtitles.forEach((sub) => {
        if (sub.speaker) {
          counts[sub.speaker] = (counts[sub.speaker] || 0) + 1;
        }
      });
      return counts;
    }, [subtitles]);

    // Check if any filter is active
    const hasActiveFilter =
      filters.duration || filters.length || filters.overlap || filters.speakers.size > 0;

    // Filter subtitles based on filters
    const filterByType = React.useCallback(
      (subs: SubtitleItem[]): SubtitleItem[] => {
        if (!hasActiveFilter) return subs;

        return subs.filter((sub, index) => {
          const prevEndTime = index > 0 ? subs[index - 1].endTime : undefined;
          const validation = validateSubtitle(sub, prevEndTime);

          // Issue filters (OR logic): show if any selected issue filter matches
          const issueFiltersActive = filters.duration || filters.length || filters.overlap;
          const hasMatchingIssue =
            (filters.duration && validation.hasDurationIssue) ||
            (filters.length && validation.hasLengthIssue) ||
            (filters.overlap && validation.hasOverlapIssue);

          // Speaker filter (OR logic): show if speaker is in selected set
          const speakerFilterActive = filters.speakers.size > 0;
          const hasMatchingSpeaker =
            speakerFilterActive && sub.speaker && filters.speakers.has(sub.speaker);

          // If both types active: must match at least one of each
          // If only issue filters: must match issue
          // If only speaker filter: must match speaker
          if (issueFiltersActive && speakerFilterActive) {
            return hasMatchingIssue && hasMatchingSpeaker;
          } else if (issueFiltersActive) {
            return hasMatchingIssue;
          } else if (speakerFilterActive) {
            return hasMatchingSpeaker;
          }

          return false;
        });
      },
      [filters, hasActiveFilter]
    );

    const filteredSubtitles = React.useMemo(() => {
      // Apply search filter first
      let result = subtitles;

      if (searchQuery.trim()) {
        const lowerQuery = searchQuery.toLowerCase().trim();
        result = result.filter(
          (sub) =>
            sub.translated?.toLowerCase().includes(lowerQuery) ||
            sub.original?.toLowerCase().includes(lowerQuery) ||
            sub.id.toString() === lowerQuery ||
            sub.speaker?.toLowerCase().includes(lowerQuery)
        );
      }

      // Then apply type filter
      result = filterByType(result);

      // Return null only if no filters are active
      if (!searchQuery.trim() && !hasActiveFilter) return null;
      return result;
    }, [subtitles, searchQuery, hasActiveFilter, filterByType]);

    // Delete mode helpers
    const visibleSubtitles = filteredSubtitles ?? subtitles;

    const selectAllForDelete = React.useCallback(() => {
      if (selectedForDelete.size === visibleSubtitles.length) {
        setSelectedForDelete(new Set());
      } else {
        setSelectedForDelete(new Set(visibleSubtitles.map((s) => s.id)));
      }
    }, [visibleSubtitles, selectedForDelete.size]);

    const confirmBulkDelete = React.useCallback(() => {
      if (deleteMultipleSubtitles && selectedForDelete.size > 0) {
        deleteMultipleSubtitles(Array.from(selectedForDelete));
        setSelectedForDelete(new Set());
        setIsDeleteMode(false);
      }
      setBulkDeleteModalOpen(false);
    }, [deleteMultipleSubtitles, selectedForDelete]);

    // Memoize chunks to prevent unnecessary re-renders of SubtitleBatch
    const chunks = React.useMemo(() => {
      const c: SubtitleItem[][] = [];
      const size = settings.proofreadBatchSize || 20;
      for (let i = 0; i < subtitles.length; i += size) {
        c.push(subtitles.slice(i, i + size));
      }
      return c;
    }, [subtitles, settings.proofreadBatchSize]);

    // We need batchSize later for rendering
    const batchSize = settings.proofreadBatchSize || 20;

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

    const isFiltering = filteredSubtitles !== null;

    // Get active filter labels for display
    const getFilterLabels = (): string[] => {
      const labels: string[] = [];
      if (filters.duration) labels.push('时间过长');
      if (filters.length) labels.push('字符过多');
      if (filters.overlap) labels.push('时间重叠');
      filters.speakers.forEach((s) => labels.push(s));
      return labels;
    };

    return (
      <div className="p-4 space-y-6">
        {/* Always show BatchHeader when completed */}
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
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            filters={filters}
            setFilters={setFilters}
            issueCounts={issueCounts}
            speakerProfiles={speakerProfiles}
            speakerCounts={speakerCounts}
            onManageSpeakers={onManageSpeakers}
            isDeleteMode={isDeleteMode}
            onToggleDeleteMode={toggleDeleteMode}
            selectedForDeleteCount={selectedForDelete.size}
            onSelectAllForDelete={selectAllForDelete}
            onConfirmDelete={() => setBulkDeleteModalOpen(true)}
            totalVisibleCount={visibleSubtitles.length}
          />
        )}

        {isFiltering ? (
          // Filtered Results View
          <>
            <div className="flex items-center justify-between text-xs text-slate-500 px-1">
              <span>
                找到 {filteredSubtitles.length} 个结果
                {hasActiveFilter && (
                  <span className="ml-2 text-indigo-400">
                    (筛选: {getFilterLabels().join(', ')})
                  </span>
                )}
              </span>
            </div>

            {filteredSubtitles.length > 0 ? (
              <div className="border border-slate-700/50 bg-slate-900/40 rounded-xl overflow-hidden">
                <Virtuoso
                  style={{ height: 'calc(100vh - 280px)' }}
                  data={filteredSubtitles}
                  itemContent={(index, sub) => {
                    const originalIndex = subtitles.findIndex((s) => s.id === sub.id);
                    const prevEndTime =
                      originalIndex > 0 ? subtitles[originalIndex - 1].endTime : undefined;
                    return (
                      <div className="border-b border-slate-800/50 last:border-b-0">
                        <SubtitleRow
                          key={sub.id}
                          sub={sub}
                          showSourceText={showSourceText}
                          editingCommentId={editingCommentId}
                          setEditingCommentId={setEditingCommentId}
                          updateLineComment={updateLineComment}
                          updateSubtitleText={updateSubtitleText}
                          updateSubtitleOriginal={updateSubtitleOriginal}
                          updateSpeaker={updateSpeaker}
                          updateSubtitleTime={updateSubtitleTime}
                          deleteSubtitle={checkDelete}
                          prevEndTime={prevEndTime}
                          speakerProfiles={speakerProfiles}
                          onManageSpeakers={onManageSpeakers}
                          isDeleteMode={isDeleteMode}
                          isSelectedForDelete={selectedForDelete.has(sub.id)}
                          onToggleDeleteSelection={toggleDeleteSelection}
                        />
                      </div>
                    );
                  }}
                />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-slate-500 bg-slate-900/30 rounded-xl border border-slate-800/50">
                <Search className="w-8 h-8 opacity-20 mb-3" />
                <p>未找到匹配的字幕</p>
              </div>
            )}
          </>
        ) : (
          // Normal Batch View
          <Virtuoso
            style={{ height: 'calc(100vh - 280px)' }}
            data={chunks}
            itemContent={(chunkIdx, chunk) => (
              <div className="mb-6">
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
                  updateSubtitleText={updateSubtitleText}
                  updateSubtitleOriginal={updateSubtitleOriginal}
                  updateSpeaker={updateSpeaker}
                  updateSubtitleTime={updateSubtitleTime}
                  deleteSubtitle={checkDelete}
                  subtitles={subtitles}
                  batchSize={batchSize}
                  speakerProfiles={speakerProfiles}
                  onManageSpeakers={onManageSpeakers}
                  isDeleteMode={isDeleteMode}
                  selectedForDelete={selectedForDelete}
                  onToggleDeleteSelection={toggleDeleteSelection}
                />
              </div>
            )}
          />
        )}

        <SimpleConfirmationModal
          isOpen={deleteModalOpen}
          onClose={() => setDeleteModalOpen(false)}
          onConfirm={confirmDelete}
          title="删除字幕"
          message="确定要删除这行字幕吗？此操作无法撤销。"
          confirmText="删除"
          type="danger"
        />

        <SimpleConfirmationModal
          isOpen={bulkDeleteModalOpen}
          onClose={() => setBulkDeleteModalOpen(false)}
          onConfirm={confirmBulkDelete}
          title="批量删除"
          message={`确定删除 ${selectedForDelete.size} 条字幕吗？此操作无法撤销。`}
          confirmText="删除"
          type="danger"
        />
      </div>
    );
  },
  (prev, next) => {
    return (
      prev.subtitles === next.subtitles &&
      prev.settings === next.settings &&
      prev.status === next.status &&
      prev.activeTab === next.activeTab &&
      prev.selectedBatches === next.selectedBatches &&
      prev.showSourceText === next.showSourceText &&
      prev.file === next.file &&
      prev.batchComments === next.batchComments &&
      prev.editingCommentId === next.editingCommentId &&
      prev.speakerProfiles === next.speakerProfiles
    );
  }
);
