import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  CheckSquare,
  Square,
  MessageCircle,
  Eye,
  EyeOff,
  RefreshCw,
  Sparkles,
  Search,
  X,
  Filter,
  AlertTriangle,
  Type,
  ChevronDown,
  User,
  Users,
  Trash2,
  ArrowDownCircle,
  Timer,
} from 'lucide-react';
import { type SubtitleItem, type SubtitleIssueType } from '@/types';
import { getSpeakerColorWithCustom } from '@/services/utils/colors';
import { cn } from '@/lib/cn';
import { useDropdown } from '@/hooks/useDropdown';
import { useWorkspaceStore, selectUIState, selectFileState } from '@/store/useWorkspaceStore';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@/store/useAppStore';

// Multi-select filter type
export interface SubtitleFilters {
  issues: Set<SubtitleIssueType>;
  speakers: Set<string>; // 选中的说话人
}

export const defaultFilters: SubtitleFilters = {
  issues: new Set(),
  speakers: new Set(),
};

interface BatchHeaderProps {
  chunks: SubtitleItem[][];
  selectedBatches: Set<number>;
  toggleAllBatches: (total: number) => void;
  selectBatchesWithComments: (chunks: SubtitleItem[][]) => void;
  handleBatchAction: (action: 'proofread' | 'regenerate', index?: number) => void;
  onRegenerateRequest?: () => void; // Opens regenerate modal
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  filters: SubtitleFilters;
  setFilters: (filters: SubtitleFilters) => void;
  issueCounts?: Record<SubtitleIssueType, number>;
  speakerCounts?: Record<string, number>; // 每个说话人的字幕条数
  // Delete mode
  isDeleteMode?: boolean;
  onToggleDeleteMode?: () => void;
  selectedForDeleteCount?: number;
  onSelectAllForDelete?: () => void;
  onConfirmDelete?: () => void;
  totalVisibleCount?: number;

  // Auto-scroll logic
  autoScrollEnabled?: boolean;
  onToggleAutoScroll?: () => void;
}

export const BatchHeader: React.FC<BatchHeaderProps> = ({
  chunks,
  selectedBatches,
  toggleAllBatches,
  selectBatchesWithComments,
  handleBatchAction,
  onRegenerateRequest,
  searchQuery,
  setSearchQuery,
  filters,
  setFilters,
  issueCounts,
  speakerCounts,
  // Delete mode
  isDeleteMode,
  onToggleDeleteMode,
  selectedForDeleteCount,
  onSelectAllForDelete,
  onConfirmDelete,
  totalVisibleCount,

  autoScrollEnabled,
  onToggleAutoScroll,
}) => {
  const { t } = useTranslation('editor');

  // Store
  const { showSourceText } = useWorkspaceStore(useShallow(selectUIState));
  const { file } = useWorkspaceStore(useShallow(selectFileState));
  const speakerProfiles = useWorkspaceStore(useShallow((s) => s.speakerProfiles));
  const { setShowSourceText } = useWorkspaceStore((s) => s.actions);
  const setShowSpeakerManager = useAppStore((s) => s.setShowSpeakerManager);
  const onManageSpeakers = () => setShowSpeakerManager(true);

  const {
    isOpen: isIssueFilterOpen,
    setIsOpen: setIsIssueFilterOpen,
    toggle: toggleIssueFilterBase,
    triggerRef: issueFilterRef,
    direction: { dropUp: issueDropUp },
  } = useDropdown<HTMLDivElement>();

  const searchInputRef = React.useRef<HTMLInputElement>(null);

  const {
    isOpen: isSpeakerFilterOpen,
    setIsOpen: setIsSpeakerFilterOpen,
    toggle: toggleSpeakerFilterBase,
    triggerRef: speakerFilterRef,
    direction: { dropUp: speakerDropUp },
  } = useDropdown<HTMLDivElement>();

  // Toggle issue filter (and close speaker)
  const toggleIssueFilter = () => {
    toggleIssueFilterBase();
    setIsSpeakerFilterOpen(false);
  };

  // Toggle speaker filter (and close issue)
  const toggleSpeakerFilter = () => {
    toggleSpeakerFilterBase();
    setIsIssueFilterOpen(false);
  };

  // Count active filters
  const activeIssueFilterCount = filters.issues.size;
  const activeSpeakerFilterCount = filters.speakers.size;

  // Clear search
  const handleClearSearch = () => {
    setSearchQuery('');
  };

  const toggleFilter = (key: SubtitleIssueType) => {
    const newIssues = new Set(filters.issues);
    if (newIssues.has(key)) {
      newIssues.delete(key);
    } else {
      newIssues.add(key);
    }
    setFilters({ ...filters, issues: newIssues });
  };

  const clearIssueFilters = () => {
    setFilters({ ...filters, issues: new Set() });
  };

  const toggleSpeaker = (speakerName: string) => {
    const newSpeakers = new Set(filters.speakers);
    if (newSpeakers.has(speakerName)) {
      newSpeakers.delete(speakerName);
    } else {
      newSpeakers.add(speakerName);
    }
    setFilters({ ...filters, speakers: newSpeakers });
  };

  const clearSpeakerFilters = () => {
    setFilters({ ...filters, speakers: new Set() });
  };

  return (
    <div className="flex flex-col gap-2 sm:gap-3 bg-white/90 p-2 sm:p-3 rounded-lg border border-slate-200 sticky top-0 z-20 backdrop-blur-md shadow-sm min-w-0 transition-all">
      {/* Row 1: Search, Filters & Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
        {/* Left: Search & Filter Tools */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 shrink">
          {/* Search Input */}
          <div className="relative group shrink min-w-0">
            <Search className="absolute left-2 sm:left-2.5 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400 group-focus-within:text-brand-purple transition-colors" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('batchHeader.searchPlaceholder')}
              className="w-full min-w-20 max-w-30 focus:max-w-37.5 sm:min-w-25 sm:max-w-35 sm:focus:max-w-45 md:max-w-60 md:focus:max-w-75 bg-white border border-slate-200 rounded-md pl-7 sm:pl-9 pr-7 sm:pr-8 py-1 sm:py-1.5 text-xs text-slate-700 placeholder-slate-400 focus:border-brand-purple focus:outline-none focus:ring-1 focus:ring-brand-purple/20 transition-all shadow-sm"
            />
            {searchQuery && (
              <button
                onClick={handleClearSearch}
                className="absolute right-1 sm:right-1.5 top-1/2 transform -translate-y-1/2 p-0.5 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600 transition-colors"
                title={t('batchHeader.clearSearch')}
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="h-4 w-px bg-slate-200 hidden sm:block"></div>

          {/* Issue Filter */}
          <div className="relative shrink-0" ref={issueFilterRef}>
            <button
              onClick={toggleIssueFilter}
              className={cn(
                'flex items-center space-x-1 sm:space-x-1.5 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-md text-xs transition-all border shadow-sm',
                activeIssueFilterCount > 0
                  ? 'bg-brand-purple/10 border-brand-purple/20 text-brand-purple font-medium'
                  : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-300 hover:bg-slate-50'
              )}
              title={t('batchHeader.filterIssues')}
            >
              <Filter className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              <span className="hidden sm:inline">{t('batchHeader.issues')}</span>
              {activeIssueFilterCount > 0 && (
                <span className="bg-brand-purple text-white text-[9px] sm:text-[10px] px-1.5 sm:px-1.5 py-0.5 rounded-full font-bold">
                  {activeIssueFilterCount}
                </span>
              )}
              <ChevronDown
                className={cn(
                  'w-2.5 h-2.5 sm:w-3 sm:h-3 transition-transform opacity-70',
                  isIssueFilterOpen && 'rotate-180'
                )}
              />
            </button>

            {isIssueFilterOpen && (
              <div
                className={cn(
                  'absolute left-0 bg-white border border-slate-200 rounded-lg shadow-xl z-30 min-w-45 py-1 animate-fade-in ring-1 ring-slate-900/5',
                  issueDropUp
                    ? 'bottom-full mb-1.5 origin-bottom-left'
                    : 'top-full mt-1.5 origin-top-left'
                )}
              >
                {/* Duration Filter */}
                <button
                  onClick={() => toggleFilter('duration')}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center space-x-2">
                    <Timer className="w-3.5 h-3.5 text-amber-500" />
                    <span
                      className={
                        filters.issues.has('duration')
                          ? 'text-amber-600 font-medium'
                          : 'text-slate-600'
                      }
                    >
                      {t('batchHeader.durationTooLong')}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    {issueCounts && (
                      <span className="text-slate-400 text-[10px]">({issueCounts.duration})</span>
                    )}
                    {filters.issues.has('duration') ? (
                      <CheckSquare className="w-4 h-4 text-brand-purple" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-300" />
                    )}
                  </div>
                </button>

                {/* Length Filter */}
                <button
                  onClick={() => toggleFilter('length')}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center space-x-2">
                    <Type className="w-3.5 h-3.5 text-rose-500" />
                    <span
                      className={
                        filters.issues.has('length')
                          ? 'text-rose-600 font-medium'
                          : 'text-slate-600'
                      }
                    >
                      {t('batchHeader.tooManyChars')}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    {issueCounts && (
                      <span className="text-slate-400 text-[10px]">({issueCounts.length})</span>
                    )}
                    {filters.issues.has('length') ? (
                      <CheckSquare className="w-4 h-4 text-brand-purple" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-300" />
                    )}
                  </div>
                </button>

                {/* Overlap Filter */}
                <button
                  onClick={() => toggleFilter('overlap')}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center space-x-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-orange-500" />
                    <span
                      className={
                        filters.issues.has('overlap')
                          ? 'text-orange-600 font-medium'
                          : 'text-slate-600'
                      }
                    >
                      {t('batchHeader.timeOverlap')}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    {issueCounts && (
                      <span className="text-slate-400 text-[10px]">({issueCounts.overlap})</span>
                    )}
                    {filters.issues.has('overlap') ? (
                      <CheckSquare className="w-4 h-4 text-brand-purple" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-300" />
                    )}
                  </div>
                </button>

                {/* Confidence Filter */}
                <button
                  onClick={() => toggleFilter('confidence')}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center space-x-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                    <span
                      className={
                        filters.issues.has('confidence')
                          ? 'text-amber-600 font-medium'
                          : 'text-slate-600'
                      }
                    >
                      {t('batchHeader.lowConfidence')}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    {issueCounts && (
                      <span className="text-slate-400 text-[10px]">
                        ({issueCounts.confidence || 0})
                      </span>
                    )}
                    {filters.issues.has('confidence') ? (
                      <CheckSquare className="w-4 h-4 text-brand-purple" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-300" />
                    )}
                  </div>
                </button>

                {/* Regression Filter */}
                <button
                  onClick={() => toggleFilter('regression')}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center space-x-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                    <span
                      className={
                        filters.issues.has('regression')
                          ? 'text-red-600 font-medium'
                          : 'text-slate-600'
                      }
                    >
                      {t('batchHeader.regression')}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    {issueCounts && (
                      <span className="text-slate-400 text-[10px]">
                        ({issueCounts.regression || 0})
                      </span>
                    )}
                    {filters.issues.has('regression') ? (
                      <CheckSquare className="w-4 h-4 text-brand-purple" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-300" />
                    )}
                  </div>
                </button>

                {/* Corrupted Filter */}
                <button
                  onClick={() => toggleFilter('corrupted')}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center space-x-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-purple-500" />
                    <span
                      className={
                        filters.issues.has('corrupted')
                          ? 'text-purple-600 font-medium'
                          : 'text-slate-600'
                      }
                    >
                      {t('batchHeader.corrupted')}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    {issueCounts && (
                      <span className="text-slate-400 text-[10px]">
                        ({issueCounts.corrupted || 0})
                      </span>
                    )}
                    {filters.issues.has('corrupted') ? (
                      <CheckSquare className="w-4 h-4 text-brand-purple" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-300" />
                    )}
                  </div>
                </button>

                {/* Clear Issues */}
                {activeIssueFilterCount > 0 && (
                  <>
                    <div className="border-t border-slate-200 my-1" />
                    <button
                      onClick={clearIssueFilters}
                      className="w-full flex items-center justify-center px-3 py-2 text-xs text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-colors"
                    >
                      <X className="w-3 h-3 mr-1" />
                      {t('batchHeader.clearIssueFilters')}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Speaker Filter */}
          {speakerProfiles && speakerProfiles.length > 0 && (
            <div className="relative shrink-0" ref={speakerFilterRef}>
              <button
                onClick={toggleSpeakerFilter}
                className={cn(
                  'flex items-center space-x-1 sm:space-x-1.5 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-md text-xs transition-all border shadow-sm',
                  activeSpeakerFilterCount > 0
                    ? 'bg-brand-purple/10 border-brand-purple/20 text-brand-purple font-medium'
                    : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-300 hover:bg-slate-50'
                )}
                title={t('batchHeader.filterSpeakers')}
              >
                <User className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                <span className="hidden sm:inline">{t('batchHeader.speaker')}</span>
                {activeSpeakerFilterCount > 0 && (
                  <span className="bg-brand-purple text-white text-[9px] sm:text-[10px] px-1.5 sm:px-1.5 py-0.5 rounded-full font-bold">
                    {activeSpeakerFilterCount}
                  </span>
                )}
                <ChevronDown
                  className={cn(
                    'w-2.5 h-2.5 sm:w-3 sm:h-3 transition-transform',
                    isSpeakerFilterOpen && 'rotate-180'
                  )}
                />
              </button>

              {isSpeakerFilterOpen && (
                <div
                  className={cn(
                    'absolute left-0 bg-white border border-slate-200 rounded-lg shadow-xl z-30 min-w-50 max-h-[60vh] overflow-y-auto py-1 animate-fade-in ring-1 ring-slate-900/5',
                    speakerDropUp
                      ? 'bottom-full mb-1.5 origin-bottom-left'
                      : 'top-full mt-1.5 origin-top-left'
                  )}
                >
                  {speakerProfiles.map((profile) => (
                    <button
                      key={profile.id}
                      onClick={() => toggleSpeaker(profile.name)}
                      className="w-full flex items-center justify-between px-3 py-1.5 text-xs hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center space-x-2 overflow-hidden">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{
                            backgroundColor: getSpeakerColorWithCustom(profile.name, profile.color),
                          }}
                        />
                        <span
                          className={cn(
                            'truncate',
                            filters.speakers.has(profile.name)
                              ? 'text-brand-purple font-medium'
                              : 'text-slate-700'
                          )}
                        >
                          {profile.name}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2 pl-2 shrink-0">
                        {speakerCounts && speakerCounts[profile.name] !== undefined && (
                          <span className="text-slate-400 text-[10px]">
                            ({speakerCounts[profile.name]})
                          </span>
                        )}
                        {filters.speakers.has(profile.name) ? (
                          <CheckSquare className="w-4 h-4 text-brand-purple" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-300" />
                        )}
                      </div>
                    </button>
                  ))}

                  {/* Clear Speakers */}
                  {activeSpeakerFilterCount > 0 && (
                    <>
                      <div className="border-t border-slate-200 my-1" />
                      <button
                        onClick={clearSpeakerFilters}
                        className="w-full flex items-center justify-center px-3 py-2 text-xs text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-colors"
                      >
                        <X className="w-3 h-3 mr-1" />
                        {t('batchHeader.clearSpeakerFilters')}
                      </button>
                    </>
                  )}

                  {/* Manage Speakers */}
                  {onManageSpeakers && (
                    <>
                      <div className="border-t border-slate-200 my-1" />
                      <button
                        onClick={() => {
                          onManageSpeakers();
                          setIsSpeakerFilterOpen(false);
                        }}
                        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs text-brand-purple hover:text-brand-purple-dark hover:bg-slate-50 transition-colors"
                      >
                        <Users className="w-3 h-3" />
                        {t('batchHeader.manageSpeakers')}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Primary Actions */}
        {!isDeleteMode && (
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {file && onRegenerateRequest && (
              <button
                onClick={onRegenerateRequest}
                disabled={selectedBatches.size === 0}
                title={t('batchHeader.regenerateDesc')}
                className={cn(
                  'flex items-center space-x-1 sm:space-x-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-md text-xs font-bold transition-all shadow-sm border',
                  selectedBatches.size > 0
                    ? 'bg-white border-brand-purple/30 text-brand-purple hover:bg-brand-purple/5 hover:border-brand-purple/60 hover:shadow-brand-purple/10'
                    : 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed'
                )}
              >
                <RefreshCw
                  className={cn(
                    'w-3 h-3',
                    selectedBatches.size > 0 &&
                      'group-hover:rotate-180 transition-transform duration-500'
                  )}
                />
                <span className="hidden sm:inline">{t('batchHeader.regenerate')}</span>
              </button>
            )}

            <button
              onClick={() => handleBatchAction('proofread')}
              disabled={selectedBatches.size === 0}
              title={t('batchHeader.polishTranslationDesc')}
              className={cn(
                'flex items-center space-x-1 sm:space-x-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-md text-xs font-bold transition-all shadow-sm border',
                selectedBatches.size > 0
                  ? 'bg-linear-to-r from-brand-purple to-brand-orange text-white border-transparent bg-origin-border hover:shadow-md hover:shadow-brand-purple/20 hover:opacity-95'
                  : 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed'
              )}
            >
              <Sparkles className="w-3 h-3" />
              <span className="hidden sm:inline">{t('batchHeader.polishTranslation')}</span>
            </button>
          </div>
        )}
      </div>

      {/* Row 2: Batch Selection & Status */}
      <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3 pt-2 border-t border-slate-300/50">
        {/* Selection Tools */}
        <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto">
          {isDeleteMode ? (
            /* Delete Mode Selection */
            <>
              <button
                onClick={onSelectAllForDelete}
                className="flex items-center space-x-1.5 sm:space-x-2 text-xs text-red-500 hover:text-red-700 transition-colors"
              >
                {selectedForDeleteCount === totalVisibleCount && totalVisibleCount! > 0 ? (
                  <CheckSquare className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-500" />
                ) : (
                  <Square className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-300" />
                )}
                <span>{t('batchHeader.selectAll')}</span>
              </button>

              <div className="h-4 w-px bg-slate-200"></div>

              <button
                onClick={onConfirmDelete}
                disabled={!selectedForDeleteCount || selectedForDeleteCount === 0}
                className={cn(
                  'flex items-center space-x-1 sm:space-x-1.5 px-2 sm:px-3 py-1 rounded-md text-xs font-bold transition-all shadow-sm border',
                  selectedForDeleteCount && selectedForDeleteCount > 0
                    ? 'bg-red-500 border-red-600 text-white hover:bg-red-600'
                    : 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed'
                )}
              >
                <Trash2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                <span>{t('batchHeader.deleteCount', { count: selectedForDeleteCount || 0 })}</span>
              </button>

              <button
                onClick={onToggleDeleteMode}
                className="flex items-center space-x-1 text-xs text-slate-500 hover:text-slate-800 transition-colors"
              >
                <X className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                <span className="hidden sm:inline">{t('batchHeader.cancel')}</span>
              </button>
            </>
          ) : (
            /* Normal Selection */
            <>
              <button
                onClick={() => toggleAllBatches(chunks.length)}
                className="flex items-center space-x-1.5 sm:space-x-2 text-xs sm:text-sm text-slate-600 hover:text-slate-900 transition-colors"
              >
                {selectedBatches.size === chunks.length ? (
                  <CheckSquare className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-brand-purple" />
                ) : (
                  <Square className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400" />
                )}
                <span>
                  {selectedBatches.size === chunks.length
                    ? t('batchHeader.deselectAll')
                    : t('batchHeader.selectAll')}
                </span>
              </button>

              <button
                onClick={() => selectBatchesWithComments(chunks)}
                className="flex items-center space-x-1.5 sm:space-x-2 text-xs sm:text-sm text-slate-600 hover:text-slate-900 transition-colors"
                title={t('batchHeader.selectWithComments')}
              >
                <MessageCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-500" />
                <span className="hidden sm:inline">{t('batchHeader.selectWithComments')}</span>
              </button>

              <div className="h-4 w-px bg-slate-200 hidden sm:block"></div>

              <button
                onClick={() => setShowSourceText(!showSourceText)}
                className="flex items-center space-x-1.5 sm:space-x-2 text-xs sm:text-sm text-slate-500 hover:text-slate-900 transition-colors"
              >
                {showSourceText ? (
                  <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                ) : (
                  <EyeOff className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                )}
                <span className="hidden sm:inline">
                  {showSourceText ? t('batchHeader.hideSource') : t('batchHeader.showSource')}
                </span>
              </button>
            </>
          )}

          <div className="h-4 w-px bg-slate-200 hidden sm:block"></div>

          {/* Auto Scroll Toggle */}
          {onToggleAutoScroll && (
            <button
              onClick={onToggleAutoScroll}
              className={cn(
                'flex items-center space-x-1.5 sm:space-x-2 text-xs sm:text-sm transition-all rounded-full px-2 py-0.5 border',
                autoScrollEnabled
                  ? 'bg-brand-purple/10 border-brand-purple/20 text-brand-purple font-medium'
                  : 'bg-transparent border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-100'
              )}
              title={
                autoScrollEnabled
                  ? t('batchHeader.disableAutoScroll')
                  : t('batchHeader.enableAutoScroll')
              }
            >
              <ArrowDownCircle
                className={cn(
                  'w-3.5 h-3.5 sm:w-4 sm:h-4 transition-colors',
                  autoScrollEnabled
                    ? 'text-brand-purple'
                    : 'text-slate-400 group-hover:text-slate-600'
                )}
              />
              <span className="hidden sm:inline">
                {autoScrollEnabled ? t('batchHeader.autoScrollOn') : t('batchHeader.autoScrollOff')}
              </span>
            </button>
          )}
        </div>

        {/* Right: Status / Delete Toggle */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {!isDeleteMode && (
            <>
              {onToggleDeleteMode && (
                <button
                  onClick={onToggleDeleteMode}
                  className="flex items-center space-x-1 sm:space-x-1.5 text-xs sm:text-sm text-red-500 hover:text-red-700 transition-colors opacity-80 hover:opacity-100 border border-transparent hover:bg-red-50 hover:border-red-100 rounded-md px-1.5 py-0.5"
                  title={t('batchHeader.batchDelete')}
                >
                  <Trash2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  <span className="hidden sm:inline">{t('batchHeader.batchDelete')}</span>
                </button>
              )}

              {onToggleDeleteMode && <div className="h-4 w-px bg-slate-200 hidden sm:block"></div>}

              <span className="text-xs sm:text-sm text-slate-500 font-medium whitespace-nowrap">
                {t('batchHeader.selectedCount', { count: selectedBatches.size })}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
