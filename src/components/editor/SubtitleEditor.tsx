import React from 'react';
import { useTranslation } from 'react-i18next';
import { Languages } from 'lucide-react';
import { type SubtitleItem, type SubtitleIssueType } from '@/types';
import { type SpeakerUIProfile } from '@/types/speaker';
import { GenerationStatus } from '@/types/api';
import { SubtitleBatchList } from '@/components/editor/SubtitleBatchList';
import { SubtitleFilteredList } from '@/components/editor/SubtitleFilteredList';
import { validateSubtitle } from '@/services/subtitle/validation';
import { BatchHeader, type SubtitleFilters, defaultFilters } from '@/components/editor/BatchHeader';
import { RegenerateModal } from '@/components/editor/RegenerateModal';
import { SearchReplacePanel } from '@/components/editor/SearchReplacePanel';
import { SimpleConfirmationModal } from '@/components/modals/SimpleConfirmationModal';
import { isVideoFile } from '@/services/utils/file';
import { timeToSeconds } from '@/services/subtitle/time';

import { useAppStore } from '@/store/useAppStore';
import {
  useWorkspaceStore,
  selectSubtitleState,
  selectGenerationState,
  selectUIState,
  selectFileState,
} from '@/store/useWorkspaceStore';
import { useShallow } from 'zustand/react/shallow';
import { useSubtitleCRUD } from '@/hooks/useWorkspaceLogic/useSubtitleCRUD';
import { useSearchReplace } from '@/hooks/useSearchReplace';
import { SearchReplaceProvider } from '@/contexts/SearchReplaceContext';

interface SubtitleEditorProps {
  activeTab: string;
  scrollContainerRef?: React.RefObject<HTMLDivElement>;

  // Video sync
  currentPlayTime?: number;
  onRowClick?: (startTime: string) => void;

  // Snapshot support
  onCreateSnapshot?: (
    description: string,
    subtitles: SubtitleItem[],
    batchComments?: Record<string, string>,
    fileId?: string,
    fileName?: string,
    speakerProfiles?: SpeakerUIProfile[]
  ) => void;
}

export const SubtitleEditor: React.FC<SubtitleEditorProps> = React.memo(
  ({
    activeTab,
    scrollContainerRef: _scrollContainerRef, // Unused but kept for interface consistency
    currentPlayTime,
    onRowClick,
    onCreateSnapshot,
  }) => {
    // Global App Store
    // Optimized: Only select the specific settings needed
    const proofreadBatchSize = useAppStore((s) => s.settings.proofreadBatchSize);

    // Workspace Store
    const { subtitles } = useWorkspaceStore(useShallow(selectSubtitleState));
    const { file } = useWorkspaceStore(useShallow(selectFileState));
    const { status } = useWorkspaceStore(useShallow(selectGenerationState));
    const { selectedBatches } = useWorkspaceStore(useShallow(selectUIState));

    const actions = useWorkspaceStore((s) => s.actions);

    // Destructure actions
    const {
      toggleAllBatches,
      selectBatchesWithComments,
      handleBatchAction,
      deleteSubtitle,
      deleteMultipleSubtitles,
    } = actions;

    // Batch replace hook
    const { batchReplaceSubtitles } = useSubtitleCRUD();

    // Adapt actions to match legacy signatures or expected props
    // SubtitleRow expects updateSpeaker to optionally accept applyToAll, but our logic ignores it.
    // We wrap it to satisfy the type signature of children.
    // Note: actions is now stable (P0 fix), so empty deps is safe

    const { t } = useTranslation(['workspace', 'editor']);
    const [searchQuery, setSearchQuery] = React.useState('');
    const [filters, setFilters] = React.useState<SubtitleFilters>(defaultFilters);
    const [deleteModalOpen, setDeleteModalOpen] = React.useState(false);
    const [deleteCandidateId, setDeleteCandidateId] = React.useState<string | null>(null);

    // Virtuoso ref for auto-scrolling
    const virtuosoRef = React.useRef<any>(null);
    const lastScrollTimeRef = React.useRef<number>(0);
    const activeBatchIndexRef = React.useRef<number>(-1);
    const filterExitTimerRef = React.useRef<NodeJS.Timeout | undefined>(undefined);
    const navigateScrollTimerRef = React.useRef<NodeJS.Timeout | undefined>(undefined);

    // Cleanup timers on unmount
    React.useEffect(() => {
      return () => {
        if (filterExitTimerRef.current) {
          clearTimeout(filterExitTimerRef.current);
        }
        if (navigateScrollTimerRef.current) {
          clearTimeout(navigateScrollTimerRef.current);
        }
      };
    }, []);

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

    // Search replace panel
    const searchInputRef = React.useRef<HTMLInputElement>(null);
    const searchReplace = useSearchReplace(subtitles);

    // Sync: panel → header (one-way, panel is the source of truth when open)
    React.useEffect(() => {
      if (searchReplace.state.searchPattern !== searchQuery) {
        setSearchQuery(searchReplace.state.searchPattern);
      }
    }, [searchReplace.state.searchPattern]); // eslint-disable-line react-hooks/exhaustive-deps

    // Wrapper for setSearchQuery that also syncs to panel when open
    const handleSearchQueryChange = React.useCallback(
      (query: string) => {
        setSearchQuery(query);
        // Also sync to panel if it's open
        if (searchReplace.state.isOpen) {
          searchReplace.setSearchPattern(query);
        }
      },
      [searchReplace]
    );

    // Handle replace current
    const handleReplaceCurrent = React.useCallback(() => {
      const result = searchReplace.replaceCurrent(subtitles);
      if (result) {
        useWorkspaceStore.setState({ subtitles: result });
      }
    }, [searchReplace, subtitles]);

    // Handle replace all
    const handleReplaceAll = React.useCallback(() => {
      const config = searchReplace.getConfig();
      const snapshotDesc = onCreateSnapshot
        ? t('editor:batchReplace.snapshotDesc', { pattern: config.searchPattern })
        : undefined;
      batchReplaceSubtitles(config, snapshotDesc, onCreateSnapshot);
      searchReplace.setIsOpen(false);
    }, [searchReplace, batchReplaceSubtitles, onCreateSnapshot, t]);

    // Search replace context value for SubtitleRow highlighting
    const searchReplaceContextValue = React.useMemo(() => {
      const currentMatch = searchReplace.getCurrentMatch();
      return {
        searchConfig: searchReplace.state.searchPattern ? searchReplace.getConfig() : null,
        showDiff: searchReplace.state.isOpen && !!searchReplace.state.replaceWith,
        currentMatchId: currentMatch ? `${currentMatch.subtitleId}:${currentMatch.field}` : null,
      };
    }, [searchReplace]);

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

    // Pre-calculate validation results for filtering optimization
    const validationMap = React.useMemo(() => {
      const map = new Map();
      subtitles.forEach((sub, index) => {
        const prevEndTime = index > 0 ? subtitles[index - 1].endTime : undefined;
        map.set(sub.id, validateSubtitle(sub, prevEndTime));
      });
      return map;
    }, [subtitles]);

    // Check if any filter is active
    const hasActiveFilter = filters.issues.size > 0 || filters.speakers.size > 0;

    // Filter subtitles based on filters
    const filterByType = React.useCallback(
      (subs: SubtitleItem[]): SubtitleItem[] => {
        if (!hasActiveFilter) return subs;

        return subs.filter((sub) => {
          // Use pre-calculated validation if available (for full list filtering)
          // Fallback to on-the-fly for subset or edge cases if needed, but map covers all IDs
          const validation = validationMap.get(sub.id) || validateSubtitle(sub, undefined);

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
      [filters, hasActiveFilter, validationMap]
    );

    const filteredSubtitles = React.useMemo(() => {
      // Apply search filter first
      let result = subtitles;

      if (searchQuery.trim()) {
        // Use searchReplace matches if panel is open and has config
        // This ensures filtering respects regex/caseSensitive options
        if (searchReplace.state.isOpen && searchReplace.matches.length > 0) {
          const matchedIds = new Set(searchReplace.matches.map((m) => m.subtitleId));
          result = result.filter((sub) => matchedIds.has(sub.id));
        } else if (searchReplace.state.isOpen && searchReplace.state.searchPattern) {
          // Panel is open but no matches - show empty result
          result = [];
        } else {
          // Fallback to simple search when panel is closed
          const lowerQuery = searchQuery.toLowerCase().trim();
          result = result.filter(
            (sub) =>
              sub.translated?.toLowerCase().includes(lowerQuery) ||
              sub.original?.toLowerCase().includes(lowerQuery) ||
              sub.id === lowerQuery ||
              sub.speaker?.toLowerCase().includes(lowerQuery)
          );
        }
      }

      // Then apply type filter
      result = filterByType(result);

      // Return null only if no filters are active
      if (!searchQuery.trim() && !hasActiveFilter) return null;
      return result;
    }, [
      subtitles,
      searchQuery,
      hasActiveFilter,
      filterByType,
      searchReplace.state.isOpen,
      searchReplace.state.searchPattern,
      searchReplace.matches,
    ]);

    // C1: Handle search replace navigation - scroll to match
    // Must be after filteredSubtitles definition
    const handleSearchReplaceNavigate = React.useCallback(
      (direction: 'prev' | 'next') => {
        const match =
          direction === 'next' ? searchReplace.goToNextMatch() : searchReplace.goToPrevMatch();

        if (match && virtuosoRef.current) {
          const batchSize = proofreadBatchSize || 20;
          const isFiltering = filteredSubtitles !== null;

          if (isFiltering && filteredSubtitles) {
            // In filter mode: find index in filtered list
            const filteredIndex = filteredSubtitles.findIndex((s) => s.id === match.subtitleId);
            if (filteredIndex !== -1) {
              virtuosoRef.current.scrollToIndex({
                index: filteredIndex,
                align: 'center',
                behavior: 'smooth',
              });
            }
          } else {
            // In batch mode: scroll to batch first, then to row
            const batchIndex = Math.floor(match.index / batchSize);
            virtuosoRef.current.scrollToIndex({
              index: batchIndex,
              align: 'start',
              behavior: 'smooth',
            });

            // Clear previous pending scroll to avoid multiple scrollIntoView calls
            if (navigateScrollTimerRef.current) {
              clearTimeout(navigateScrollTimerRef.current);
            }

            // Delay row-level scroll to let Virtuoso finish
            navigateScrollTimerRef.current = setTimeout(() => {
              const element = document.getElementById(`subtitle-row-${match.subtitleId}`);
              if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
              navigateScrollTimerRef.current = undefined;
            }, 300);
          }
        }
      },
      [searchReplace, proofreadBatchSize, filteredSubtitles]
    );

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
      const size = proofreadBatchSize || 20;
      for (let i = 0; i < subtitles.length; i += size) {
        c.push(subtitles.slice(i, i + size));
      }
      return c;
    }, [subtitles, proofreadBatchSize]);

    // Reset auto-scroll memory if data changes drastically
    React.useEffect(() => {
      activeBatchIndexRef.current = -1;
    }, [chunks.length]);

    // Helper: find active batch index using binary search with linear fallback
    // A1: Moved before useEffect to satisfy ESLint exhaustive-deps
    const findActiveBatchIndex = React.useCallback(
      (chunksArr: SubtitleItem[][], time: number): number => {
        if (chunksArr.length === 0) return -1;

        // Try binary search first (assumes chunks are sorted by time)
        let lo = 0;
        let hi = chunksArr.length - 1;

        while (lo <= hi) {
          const mid = Math.floor((lo + hi) / 2);
          const chunk = chunksArr[mid];
          const start = timeToSeconds(chunk[0].startTime);
          const end = timeToSeconds(chunk[chunk.length - 1].endTime);

          if (time >= start && time < end) {
            return mid;
          } else if (time < start) {
            hi = mid - 1;
          } else {
            lo = mid + 1;
          }
        }

        // Binary search failed (possibly unsorted data), fallback to linear search
        return chunksArr.findIndex((chunk) => {
          const start = timeToSeconds(chunk[0].startTime);
          const end = timeToSeconds(chunk[chunk.length - 1].endTime);
          return time >= start && time < end;
        });
      },
      []
    );

    // Helper: find active subtitle index within items using binary search with linear fallback
    const findActiveSubtitleIndex = React.useCallback(
      (items: SubtitleItem[], time: number): number => {
        if (items.length === 0) return -1;

        // Try binary search first (assumes items are sorted by time)
        let lo = 0;
        let hi = items.length - 1;

        while (lo <= hi) {
          const mid = Math.floor((lo + hi) / 2);
          const start = timeToSeconds(items[mid].startTime);
          const end = timeToSeconds(items[mid].endTime);

          if (time >= start && time < end) {
            return mid;
          } else if (time < start) {
            hi = mid - 1;
          } else {
            lo = mid + 1;
          }
        }

        // Binary search failed (possibly unsorted data), fallback to linear search
        return items.findIndex((item) => {
          const start = timeToSeconds(item.startTime);
          const end = timeToSeconds(item.endTime);
          return time >= start && time < end;
        });
      },
      []
    );

    // Track previous filter state to detect filter mode changes
    const prevIsFilteringRef = React.useRef<boolean>(false);

    // Reset auto-scroll memory when exiting filter mode to trigger re-scroll
    React.useEffect(() => {
      // Clear any pending filter exit timer
      if (filterExitTimerRef.current) {
        clearTimeout(filterExitTimerRef.current);
        filterExitTimerRef.current = undefined;
      }

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
          filterExitTimerRef.current = setTimeout(() => {
            const activeBatchIndex = findActiveBatchIndex(chunks, currentPlayTime);

            if (activeBatchIndex !== -1 && virtuosoRef.current) {
              virtuosoRef.current.scrollToIndex({
                index: activeBatchIndex,
                align: 'start',
                behavior: 'auto', // Use 'auto' for instant positioning
              });
              activeBatchIndexRef.current = activeBatchIndex;
            }
            filterExitTimerRef.current = undefined;
          }, 50);
        }
      }
    }, [filteredSubtitles, chunks, currentPlayTime, findActiveBatchIndex]);

    // Auto-scroll logic
    const [autoScrollEnabled, setAutoScrollEnabled] = React.useState(true);
    const isUserScrollingRef = React.useRef(false);
    const userScrollTimeoutRef = React.useRef<NodeJS.Timeout | undefined>(undefined);
    const rowScrollTimerRef = React.useRef<NodeJS.Timeout | undefined>(undefined);

    // Cleanup row scroll timer on unmount
    React.useEffect(() => {
      return () => {
        if (rowScrollTimerRef.current) {
          clearTimeout(rowScrollTimerRef.current);
        }
      };
    }, []);

    // Handle scroll events to detect manual scrolling (wheel/touch only, not keyboard)
    const handleUserScrollInteraction = React.useCallback(() => {
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

      // Don't auto-scroll if search panel is open (user is navigating matches)
      if (searchReplace.state.isOpen) return;

      // Don't auto-scroll if user is editing a subtitle
      const editingSubtitleId = useWorkspaceStore.getState().editingSubtitleId;
      if (editingSubtitleId !== null) return;

      // Don't auto-scroll if user is actively scrolling
      if (isUserScrollingRef.current) return;

      // Throttle scrolling to avoid jitter (e.g., 60fps updates vs scroll behavior)
      const now = Date.now();
      if (now - lastScrollTimeRef.current < 800) return;

      // 1. Determine active item index (using binary search with linear fallback)
      if (filteredSubtitles) {
        const activeIndex = findActiveSubtitleIndex(filteredSubtitles, currentPlayTime);

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
        const activeBatchIndex = findActiveBatchIndex(chunks, currentPlayTime);

        if (activeBatchIndex !== -1) {
          const batchChanged = activeBatchIndex !== activeBatchIndexRef.current;

          // Find the active subtitle within the batch
          const activeSubIndex = findActiveSubtitleIndex(chunks[activeBatchIndex], currentPlayTime);
          const activeSub = activeSubIndex !== -1 ? chunks[activeBatchIndex][activeSubIndex] : null;

          if (batchChanged) {
            // Batch changed: first scroll to batch with Virtuoso, then delay scroll to row
            virtuosoRef.current.scrollToIndex({
              index: activeBatchIndex,
              align: 'start',
              behavior: 'smooth',
            });
            activeBatchIndexRef.current = activeBatchIndex;

            // Clear any pending row scroll timer
            if (rowScrollTimerRef.current) {
              clearTimeout(rowScrollTimerRef.current);
            }

            // Delay row-level scroll to avoid competing with Virtuoso animation
            if (activeSub) {
              rowScrollTimerRef.current = setTimeout(() => {
                const element = document.getElementById(`subtitle-row-${activeSub.id}`);
                if (element) {
                  element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
                rowScrollTimerRef.current = undefined;
              }, 300);
            }
            lastScrollTimeRef.current = now;
          } else {
            // Batch didn't change: only do row-level scroll (no Virtuoso competition)
            if (activeSub) {
              const element = document.getElementById(`subtitle-row-${activeSub.id}`);
              if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                lastScrollTimeRef.current = now;
              }
            }
          }
        }
      }
    }, [
      currentPlayTime,
      filteredSubtitles,
      chunks,
      autoScrollEnabled,
      searchReplace.state.isOpen,
      findActiveBatchIndex,
      findActiveSubtitleIndex,
    ]);

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
      <SearchReplaceProvider value={searchReplaceContextValue}>
        <div
          className="p-4 space-y-6 h-full flex flex-col"
          onWheel={handleUserScrollInteraction}
          onTouchMove={handleUserScrollInteraction}
        >
          {/* Always show BatchHeader when completed or cancelled (so UI remains usable after abort) */}
          {(status === GenerationStatus.COMPLETED || status === GenerationStatus.CANCELLED) && (
            <BatchHeader
              chunks={chunks}
              selectedBatches={selectedBatches}
              toggleAllBatches={toggleAllBatches}
              selectBatchesWithComments={selectBatchesWithComments}
              handleBatchAction={handleBatchAction}
              searchQuery={searchQuery}
              setSearchQuery={handleSearchQueryChange}
              filters={filters}
              setFilters={setFilters}
              issueCounts={issueCounts}
              speakerCounts={speakerCounts}
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
              onSearchReplacePanelToggle={() =>
                searchReplace.setIsOpen(!searchReplace.state.isOpen)
              }
              isSearchReplacePanelOpen={searchReplace.state.isOpen}
              searchInputRef={searchInputRef}
            />
          )}

          {isFiltering ? (
            <SubtitleFilteredList
              filteredSubtitles={filteredSubtitles}
              hasActiveFilter={hasActiveFilter}
              getFilterLabels={getFilterLabels}
              virtuosoRef={virtuosoRef}
              checkDelete={checkDelete}
              isDeleteMode={isDeleteMode}
              selectedForDelete={selectedForDelete}
              toggleDeleteSelection={toggleDeleteSelection}
              currentPlayTime={currentPlayTime}
              onRowClick={onRowClick}
            />
          ) : (
            <SubtitleBatchList
              chunks={chunks}
              status={status}
              virtuosoRef={virtuosoRef}
              checkDelete={checkDelete}
              isDeleteMode={isDeleteMode}
              selectedForDelete={selectedForDelete}
              toggleDeleteSelection={toggleDeleteSelection}
              currentPlayTime={currentPlayTime}
              onRowClick={onRowClick}
            />
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

          {/* Search Replace Panel (floating) */}
          <SearchReplacePanel
            isOpen={searchReplace.state.isOpen}
            onClose={() => searchReplace.setIsOpen(false)}
            anchorRef={searchInputRef}
            searchPattern={searchReplace.state.searchPattern}
            replaceWith={searchReplace.state.replaceWith}
            isRegex={searchReplace.state.isRegex}
            caseSensitive={searchReplace.state.caseSensitive}
            currentMatchIndex={searchReplace.currentMatchIndex}
            totalMatches={searchReplace.totalMatches}
            regexError={searchReplace.regexError}
            onSearchChange={searchReplace.setSearchPattern}
            onReplaceChange={searchReplace.setReplaceWith}
            onRegexChange={searchReplace.setIsRegex}
            onCaseSensitiveChange={searchReplace.setCaseSensitive}
            onReplaceCurrent={handleReplaceCurrent}
            onReplaceAll={handleReplaceAll}
            onNavigate={handleSearchReplaceNavigate}
          />
        </div>
      </SearchReplaceProvider>
    );
  },
  (prev, next) => {
    return prev.activeTab === next.activeTab && prev.currentPlayTime === next.currentPlayTime;
  }
);
