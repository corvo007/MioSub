import React from 'react';
import { useTranslation } from 'react-i18next';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import { Search } from 'lucide-react';
import { SubtitleRow } from '@/components/editor/SubtitleRow';
import { type SubtitleItem } from '@/types';
import { useWorkspaceStore, selectSubtitleState } from '@/store/useWorkspaceStore';
import { useShallow } from 'zustand/react/shallow';

interface SubtitleFilteredListProps {
  filteredSubtitles: SubtitleItem[];
  hasActiveFilter: boolean;
  getFilterLabels: () => string[];
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

export const SubtitleFilteredList: React.FC<SubtitleFilteredListProps> = React.memo(
  ({
    filteredSubtitles,
    hasActiveFilter,
    getFilterLabels,
    virtuosoRef,
    checkDelete,
    isDeleteMode,
    selectedForDelete,
    toggleDeleteSelection,
    currentPlayTime,
    onRowClick,
  }) => {
    const { t } = useTranslation('editor');

    // Store Connectors
    const { subtitles } = useWorkspaceStore(useShallow(selectSubtitleState));
    const speakerProfiles = useWorkspaceStore(useShallow((s) => s.speakerProfiles));

    // Pre-compute index map for O(1) lookup
    const idToIndexMap = React.useMemo(
      () => new Map(subtitles.map((s, i) => [s.id, i])),
      [subtitles]
    );

    if (filteredSubtitles.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-slate-500 bg-slate-50/50 rounded-xl border border-slate-200/60 border-dashed shadow-sm">
          <Search className="w-8 h-8 opacity-20 text-slate-400 mb-3" />
          <p>{t('noMatchingSubtitles')}</p>
        </div>
      );
    }

    return (
      <>
        <div className="flex items-center justify-between text-xs text-slate-500 px-1">
          <span>
            {t('foundResults', { count: filteredSubtitles.length })}
            {hasActiveFilter && (
              <span className="ml-2 text-brand-purple font-medium">
                ({t('filtering')}: {getFilterLabels().join(', ')})
              </span>
            )}
          </span>
        </div>

        <div className="border border-slate-300 bg-white/50 backdrop-blur-sm rounded-xl overflow-hidden flex-1 min-h-0 shadow-sm transition-all">
          <Virtuoso
            ref={virtuosoRef}
            style={{ height: '100%' }}
            data={filteredSubtitles}
            context={{ speakerProfiles }}
            itemContent={(index, sub) => {
              const originalIndex = idToIndexMap.get(sub.id) ?? -1;
              const prevEndTime =
                originalIndex > 0 ? subtitles[originalIndex - 1].endTime : undefined;

              return (
                <div className="border-b border-slate-200 last:border-b-0">
                  <SubtitleRow
                    key={sub.id}
                    sub={sub}
                    deleteSubtitle={checkDelete}
                    prevEndTime={prevEndTime}
                    isDeleteMode={isDeleteMode}
                    isSelectedForDelete={selectedForDelete.has(sub.id)}
                    onToggleDeleteSelection={toggleDeleteSelection}
                    currentPlayTime={currentPlayTime}
                    onRowClick={onRowClick}
                  />
                </div>
              );
            }}
          />
        </div>
      </>
    );
  }
);
