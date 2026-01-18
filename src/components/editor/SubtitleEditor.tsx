import React from 'react';
import { useTranslation } from 'react-i18next';
import { Languages, Search } from 'lucide-react';
import { type SubtitleItem, type SubtitleIssueType, type RegeneratePrompts } from '@/types';
import { type SpeakerUIProfile } from '@/types/speaker';
import { GenerationStatus } from '@/types/api';
import { SubtitleBatch } from '@/components/editor/SubtitleBatch';
import { SubtitleRow, validateSubtitle } from '@/components/editor/SubtitleRow';
import { BatchHeader, type SubtitleFilters, defaultFilters } from '@/components/editor/BatchHeader';
import { RegenerateModal } from '@/components/editor/RegenerateModal';
import { SimpleConfirmationModal } from '@/components/modals/SimpleConfirmationModal';
import { isVideoFile } from '@/services/utils/file';
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
  handleBatchAction: (
    action: 'proofread' | 'regenerate',
    index?: number,
    prompts?: RegeneratePrompts
  ) => void;
  batchComments: Record<string, string>;
  toggleBatch: (index: number) => void;
  updateBatchComment: (index: number, comment: string) => void;
  editingCommentId: string | null;
  setEditingCommentId: (id: string | null) => void;
  updateLineComment: (id: string, comment: string) => void;
  updateSubtitleText: (id: string, translated: string) => void;
  updateSubtitleOriginal: (id: string, original: string) => void;
  updateSpeaker: (id: string, speaker: string, applyToAll?: boolean) => void;
  updateSubtitleTime?: (id: string, startTime: string, endTime: string) => void;
  deleteSubtitle?: (id: string) => void;
  deleteMultipleSubtitles?: (ids: string[]) => void;
  // Add subtitle
  addSubtitle?: (referenceId: string, position: 'before' | 'after', defaultTime: string) => void;
  speakerProfiles?: SpeakerUIProfile[];
  onManageSpeakers?: () => void;
  scrollContainerRef?: React.RefObject<HTMLDivElement>;

  // Video sync
  currentPlayTime?: number;
  onRowClick?: (startTime: string) => void;
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
    addSubtitle,
    speakerProfiles,

    onManageSpeakers,
    scrollContainerRef: _scrollContainerRef, // Unused but kept for interface consistency

    // Video sync
    currentPlayTime,
    onRowClick,
  }) => {
    const { t } = useTranslation(['workspace', 'editor']);
    const [searchQuery, setSearchQuery] = React.useState('');
    const [filters, setFilters] = React.useState<SubtitleFilters>(defaultFilters);
    const [deleteModalOpen, setDeleteModalOpen] = React.useState(false);
    const [deleteCandidateId, setDeleteCandidateId] = React.useState<string | null>(null);

    // Virtuoso ref for auto-scrolling
    const virtuosoRef = React.useRef<any>(null);
    const lastScrollTimeRef = React.useRef<number>(0);
    const activeBatchIndexRef = React.useRef<number>(-1);

    const checkDelete = React.useCallback((id: string) => {
      setDeleteCandidateId(id);
      setDeleteModalOpen(true);
    }, []);

    const confirmDelete = React.useCallback(() => {
      if (deleteCandidateId !== null && deleteSubtitle) {
        deleteSubtitle(deleteCandidateId);
      }
    }, [deleteCandidateId, deleteSubtitle]);

    const [isDeleteMode, setIsDeleteMode] = React.useState(false);
    const [selectedForDelete, setSelectedForDelete] = React.useState<Set<string>>(new Set());
    const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = React.useState(false);

    // Regenerate modal state
    const [regenerateModalOpen, setRegenerateModalOpen] = React.useState(false);

    const toggleDeleteMode = React.useCallback(() => {
      if (isDeleteMode) {
        setSelectedForDelete(new Set());
      }
      setIsDeleteMode(!isDeleteMode);
    }, [isDeleteMode]);

    const toggleDeleteSelection = React.useCallback((id: string) => {
      setSelectedForDelete((prev) => {
        const newSet = new Set(prev);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        return newSet;
      });
    }, []);

    // Calculate issue counts for filter dropdown
    const issueCounts = React.useMemo(() => {
      const counts: Record<SubtitleIssueType, number> = {
        duration: 0,
        length: 0,
        overlap: 0,
        confidence: 0,
        regression: 0,
        corrupted: 0,
      };

      subtitles.forEach((sub, index) => {
        const prevEndTime = index > 0 ? subtitles[index - 1].endTime : undefined;
        const validation = validateSubtitle(sub, prevEndTime);
        if (validation.hasDurationIssue) counts.duration++;
        if (validation.hasLengthIssue) counts.length++;
        if (validation.hasOverlapIssue) counts.overlap++;
        if (sub.lowConfidence) counts.confidence++;
        if (sub.hasRegressionIssue) counts.regression++;
        if (sub.hasCorruptedRangeIssue) counts.corrupted++;
      });

      return counts;
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
    const hasActiveFilter = filters.issues.size > 0 || filters.speakers.size > 0;

    // Filter subtitles based on filters
    const filterByType = React.useCallback(
      (subs: SubtitleItem[]): SubtitleItem[] => {
        if (!hasActiveFilter) return subs;

        return subs.filter((sub, index) => {
          const prevEndTime = index > 0 ? subs[index - 1].endTime : undefined;
          const validation = validateSubtitle(sub, prevEndTime);

          // Issue filters (OR logic): show if any selected issue filter matches
          const issueFiltersActive = filters.issues.size > 0;
          const hasMatchingIssue =
            (filters.issues.has('duration') && validation.hasDurationIssue) ||
            (filters.issues.has('length') && validation.hasLengthIssue) ||
            (filters.issues.has('overlap') && validation.hasOverlapIssue) ||
            (filters.issues.has('confidence') && sub.lowConfidence) ||
            (filters.issues.has('regression') && sub.hasRegressionIssue) ||
            (filters.issues.has('corrupted') && sub.hasCorruptedRangeIssue);

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
            sub.id === lowerQuery ||
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

    // Reset auto-scroll memory if data changes drastically
    React.useEffect(() => {
      activeBatchIndexRef.current = -1;
    }, [chunks.length]);

    // Track previous filter state to detect filter mode changes
    const prevIsFilteringRef = React.useRef<boolean>(false);

    // Reset auto-scroll memory when exiting filter mode to trigger re-scroll
    React.useEffect(() => {
      const wasFiltering = prevIsFilteringRef.current;
      const isNowFiltering = filteredSubtitles !== null;

      // Update ref for next render
      prevIsFilteringRef.current = isNowFiltering;

      // When exiting filter mode, reset batch index to trigger auto-scroll
      if (wasFiltering && !isNowFiltering) {
        activeBatchIndexRef.current = -1;
        lastScrollTimeRef.current = 0; // Allow immediate scroll

        // If we have a current play time, scroll to it after a brief delay
        // (to let Virtuoso mount the new view)
        if (currentPlayTime !== undefined && virtuosoRef.current) {
          setTimeout(() => {
            const activeBatchIndex = chunks.findIndex((chunk) => {
              const start = parseTime(chunk[0].startTime);
              const end = parseTime(chunk[chunk.length - 1].endTime);
              return currentPlayTime >= start && currentPlayTime <= end;
            });

            if (activeBatchIndex !== -1 && virtuosoRef.current) {
              virtuosoRef.current.scrollToIndex({
                index: activeBatchIndex,
                align: 'start',
                behavior: 'auto', // Use 'auto' for instant positioning
              });
              activeBatchIndexRef.current = activeBatchIndex;
            }
          }, 50);
        }
      }
    }, [filteredSubtitles, chunks, currentPlayTime]);

    // We need batchSize later for rendering
    const batchSize = settings.proofreadBatchSize || 20;

    // Use a helper function for parsing time to avoid cyclical dependencies if imported from utils
    const parseTime = (timeStr: string) => {
      if (!timeStr) return 0;
      // Simple parser for HH:MM:SS,mmm or HH:MM:SS.mmm
      const [hms, ms] = timeStr.replace(',', '.').split('.');
      const parts = hms.split(':').map(Number);
      let seconds = 0;
      if (parts.length === 3) seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
      else if (parts.length === 2) seconds = parts[0] * 60 + parts[1];

      if (ms) seconds += Number('0.' + ms);
      return seconds;
    };

    // Auto-scroll logic
    const [autoScrollEnabled, setAutoScrollEnabled] = React.useState(true);
    const isUserScrollingRef = React.useRef(false);
    const userScrollTimeoutRef = React.useRef<NodeJS.Timeout | undefined>(undefined);

    // Handle scroll events to detect manual scrolling
    const handleUserInteraction = React.useCallback(() => {
      isUserScrollingRef.current = true;

      if (userScrollTimeoutRef.current) {
        clearTimeout(userScrollTimeoutRef.current);
      }

      // Reset lock after 3 seconds of no interaction
      userScrollTimeoutRef.current = setTimeout(() => {
        isUserScrollingRef.current = false;
      }, 3000);
    }, []);

    React.useEffect(() => {
      if (currentPlayTime === undefined || !virtuosoRef.current) return;

      // Don't auto-scroll if disabled
      if (!autoScrollEnabled) return;

      // Don't auto-scroll if user is actively investigating other parts
      // Or if we haven't scrolled in a while (lock expired)
      if (isUserScrollingRef.current) return;

      // Throttle scrolling to avoid jitter (e.g., 60fps updates vs scroll behavior)
      const now = Date.now();
      if (now - lastScrollTimeRef.current < 800) return;

      // 1. Determine active item index
      if (filteredSubtitles) {
        const activeIndex = filteredSubtitles.findIndex((sub) => {
          const start = parseTime(sub.startTime);
          const end = parseTime(sub.endTime);
          return currentPlayTime >= start && currentPlayTime <= end;
        });

        if (activeIndex !== -1) {
          virtuosoRef.current.scrollToIndex({
            index: activeIndex,
            align: 'center',
            behavior: 'smooth',
          });
          lastScrollTimeRef.current = now;
        }
      } else {
        // 2. Batch Mode Logic
        const activeBatchIndex = chunks.findIndex((chunk) => {
          const start = parseTime(chunk[0].startTime);
          const end = parseTime(chunk[chunk.length - 1].endTime);
          return currentPlayTime >= start && currentPlayTime <= end;
        });

        if (activeBatchIndex !== -1) {
          // Hybrid Approach:
          // First, ensure the batch is generally visible using Virtuoso
          if (activeBatchIndex !== activeBatchIndexRef.current) {
            virtuosoRef.current.scrollToIndex({
              index: activeBatchIndex,
              align: 'start',
              behavior: 'smooth',
            });
            activeBatchIndexRef.current = activeBatchIndex;
          }

          // Second, try to find the specific active subtitle row in the DOM
          // and scroll it into view for granular precision
          const activeSub = chunks[activeBatchIndex].find((sub) => {
            const start = parseTime(sub.startTime);
            const end = parseTime(sub.endTime);
            return currentPlayTime >= start && currentPlayTime <= end;
          });

          if (activeSub) {
            const element = document.getElementById(`subtitle-row-${activeSub.id}`);
            if (element) {
              element.scrollIntoView({ behavior: 'smooth', block: 'center' });
              lastScrollTimeRef.current = now;
            }
          }
        }
      }
    }, [currentPlayTime, filteredSubtitles, chunks, autoScrollEnabled]);

    if (chunks.length === 0) {
      return (
        <div className="h-full flex flex-col items-center justify-center text-slate-600 p-8 min-h-75">
          <div className="w-16 h-16 border-2 border-slate-700 border-dashed rounded-full flex items-center justify-center mb-4">
            <Languages className="w-6 h-6" />
          </div>
          <p className="font-medium">{t('editor.noSubtitles')}</p>
          <p className="text-sm mt-2 max-w-xs text-center opacity-70">
            {activeTab === 'new' ? t('editor.emptyStateNew') : t('editor.emptyStateImport')}
          </p>
        </div>
      );
    }

    const isFiltering = filteredSubtitles !== null;

    // Get active filter labels for display
    const getFilterLabels = (): string[] => {
      const labels: string[] = [];
      if (filters.issues.has('duration')) labels.push(t('editor:batchHeader.durationTooLong'));
      if (filters.issues.has('length')) labels.push(t('editor:batchHeader.tooManyChars'));
      if (filters.issues.has('overlap')) labels.push(t('editor:batchHeader.timeOverlap'));
      if (filters.issues.has('confidence')) labels.push(t('editor:batchHeader.lowConfidence'));
      if (filters.issues.has('regression')) labels.push(t('editor:batchHeader.regression'));
      if (filters.issues.has('corrupted')) labels.push(t('editor:batchHeader.corrupted'));
      filters.speakers.forEach((s) => labels.push(s));
      return labels;
    };

    return (
      <div
        className="p-4 space-y-6 h-full flex flex-col"
        onWheel={handleUserInteraction}
        onTouchMove={handleUserInteraction}
        onKeyDown={handleUserInteraction}
      >
        {/* Always show BatchHeader when completed or cancelled (so UI remains usable after abort) */}
        {(status === GenerationStatus.COMPLETED || status === GenerationStatus.CANCELLED) && (
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
            onToggleAutoScroll={
              typeof window !== 'undefined' &&
              !!window.electronAPI?.isElectron &&
              file &&
              isVideoFile(file)
                ? () => setAutoScrollEnabled((prev) => !prev)
                : undefined
            }
            autoScrollEnabled={autoScrollEnabled}
            onRegenerateRequest={file ? () => setRegenerateModalOpen(true) : undefined}
          />
        )}

        {isFiltering ? (
          // Filtered Results View
          <>
            <div className="flex items-center justify-between text-xs text-slate-500 px-1">
              <span>
                {t('editor.foundResults', { count: filteredSubtitles.length })}
                {hasActiveFilter && (
                  <span className="ml-2 text-brand-purple font-medium">
                    ({t('editor.filtering')}: {getFilterLabels().join(', ')})
                  </span>
                )}
              </span>
            </div>

            {filteredSubtitles.length > 0 ? (
              <div className="border border-slate-300 bg-white/50 backdrop-blur-sm rounded-xl overflow-hidden flex-1 min-h-0 shadow-sm transition-all">
                <Virtuoso
                  ref={virtuosoRef}
                  style={{ height: '100%' }}
                  data={filteredSubtitles}
                  context={{ speakerProfiles }}
                  itemContent={(index, sub) => {
                    const originalIndex = subtitles.findIndex((s) => s.id === sub.id);
                    const prevEndTime =
                      originalIndex > 0 ? subtitles[originalIndex - 1].endTime : undefined;
                    return (
                      <div className="border-b border-slate-200 last:border-b-0">
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
                          addSubtitle={addSubtitle}
                          currentPlayTime={currentPlayTime}
                          onRowClick={onRowClick}
                        />
                      </div>
                    );
                  }}
                />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-slate-500 bg-slate-50/50 rounded-xl border border-slate-200/60 border-dashed shadow-sm">
                <Search className="w-8 h-8 opacity-20 text-slate-400 mb-3" />
                <p>{t('editor.noMatchingSubtitles')}</p>
              </div>
            )}
          </>
        ) : (
          // Normal Batch View
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
                    addSubtitle={addSubtitle}
                    currentPlayTime={currentPlayTime}
                    onRowClick={onRowClick}
                  />
                </div>
              )}
            />
          </div>
        )}

        <SimpleConfirmationModal
          isOpen={deleteModalOpen}
          onClose={() => setDeleteModalOpen(false)}
          onConfirm={confirmDelete}
          title={t('editor.deleteConfirm.title')}
          message={t('editor.deleteConfirm.message')}
          confirmText={t('editor.deleteConfirm.confirm')}
          type="danger"
        />

        <SimpleConfirmationModal
          isOpen={bulkDeleteModalOpen}
          onClose={() => setBulkDeleteModalOpen(false)}
          onConfirm={confirmBulkDelete}
          title={t('editor.batchDeleteConfirm.title')}
          message={t('editor.batchDeleteConfirm.message', { count: selectedForDelete.size })}
          confirmText={t('editor.batchDeleteConfirm.confirm')}
          type="danger"
        />

        <RegenerateModal
          isOpen={regenerateModalOpen}
          onClose={() => setRegenerateModalOpen(false)}
          onConfirm={(prompts) => {
            setRegenerateModalOpen(false);
            handleBatchAction('regenerate', undefined, prompts);
          }}
          selectedCount={selectedBatches.size}
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
      prev.speakerProfiles === next.speakerProfiles &&
      prev.currentPlayTime === next.currentPlayTime // Check play time for sync
    );
  }
);
