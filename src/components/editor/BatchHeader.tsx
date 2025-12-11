import React from 'react';
import {
  CheckSquare,
  Square,
  MessageCircle,
  Eye,
  EyeOff,
  Clock,
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
  Shield,
} from 'lucide-react';
import { SubtitleItem } from '@/types';
import { SpeakerUIProfile } from '@/types/speaker';
import { getSpeakerColor } from '@/utils/colors';

// Multi-select filter type
export interface SubtitleFilters {
  duration: boolean; // 时间过长
  length: boolean; // 字符过多
  overlap: boolean; // 时间重叠
  speakers: Set<string>; // 选中的说话人
}

export const defaultFilters: SubtitleFilters = {
  duration: false,
  length: false,
  overlap: false,
  speakers: new Set(),
};

interface BatchHeaderProps {
  chunks: SubtitleItem[][];
  selectedBatches: Set<number>;
  toggleAllBatches: (total: number) => void;
  selectBatchesWithComments: (chunks: SubtitleItem[][]) => void;
  showSourceText: boolean;
  setShowSourceText: (show: boolean) => void;
  file: File | null;
  handleBatchAction: (action: 'proofread' | 'fix_timestamps', index?: number) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  filters: SubtitleFilters;
  setFilters: (filters: SubtitleFilters) => void;
  issueCounts?: { duration: number; length: number; overlap: number };
  speakerProfiles?: SpeakerUIProfile[];
  speakerCounts?: Record<string, number>; // 每个说话人的字幕条数
  onManageSpeakers?: () => void;
  // Delete mode
  isDeleteMode?: boolean;
  onToggleDeleteMode?: () => void;
  selectedForDeleteCount?: number;
  onSelectAllForDelete?: () => void;
  onConfirmDelete?: () => void;
  totalVisibleCount?: number;
  // Conservative mode
  conservativeBatchMode?: boolean;
  onToggleConservativeMode?: () => void;
}

// Minimum space required below to open downward (in pixels)
const MIN_SPACE_BELOW = 200;

export const BatchHeader: React.FC<BatchHeaderProps> = ({
  chunks,
  selectedBatches,
  toggleAllBatches,
  selectBatchesWithComments,
  showSourceText,
  setShowSourceText,
  file,
  handleBatchAction,
  searchQuery,
  setSearchQuery,
  filters,
  setFilters,
  issueCounts,
  speakerProfiles,
  speakerCounts,
  onManageSpeakers,
  // Delete mode
  isDeleteMode,
  onToggleDeleteMode,
  selectedForDeleteCount,
  onSelectAllForDelete,
  onConfirmDelete,
  totalVisibleCount,
  // Conservative mode
  conservativeBatchMode,
  onToggleConservativeMode,
}) => {
  const [isIssueFilterOpen, setIsIssueFilterOpen] = React.useState(false);
  const [isSpeakerFilterOpen, setIsSpeakerFilterOpen] = React.useState(false);
  const [issueDropUp, setIssueDropUp] = React.useState(false);
  const [speakerDropUp, setSpeakerDropUp] = React.useState(false);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const issueFilterRef = React.useRef<HTMLDivElement>(null);
  const speakerFilterRef = React.useRef<HTMLDivElement>(null);

  // Toggle issue filter with smart direction detection
  const toggleIssueFilter = () => {
    if (!isIssueFilterOpen) {
      if (issueFilterRef.current) {
        const rect = issueFilterRef.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        setIssueDropUp(spaceBelow < MIN_SPACE_BELOW);
      }
    }
    setIsIssueFilterOpen(!isIssueFilterOpen);
    setIsSpeakerFilterOpen(false);
  };

  // Toggle speaker filter with smart direction detection
  const toggleSpeakerFilter = () => {
    if (!isSpeakerFilterOpen) {
      if (speakerFilterRef.current) {
        const rect = speakerFilterRef.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        setSpeakerDropUp(spaceBelow < MIN_SPACE_BELOW);
      }
    }
    setIsSpeakerFilterOpen(!isSpeakerFilterOpen);
    setIsIssueFilterOpen(false);
  };

  // Count active filters
  const activeIssueFilterCount = [filters.duration, filters.length, filters.overlap].filter(
    Boolean
  ).length;
  const activeSpeakerFilterCount = filters.speakers.size;

  // Close filter dropdowns when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (issueFilterRef.current && !issueFilterRef.current.contains(event.target as Node)) {
        setIsIssueFilterOpen(false);
      }
      if (speakerFilterRef.current && !speakerFilterRef.current.contains(event.target as Node)) {
        setIsSpeakerFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Clear search
  const handleClearSearch = () => {
    setSearchQuery('');
  };

  const toggleFilter = (key: keyof SubtitleFilters) => {
    setFilters({ ...filters, [key]: !filters[key] });
  };

  const clearIssueFilters = () => {
    setFilters({ ...filters, duration: false, length: false, overlap: false });
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
    <div className="flex flex-col gap-2 sm:gap-3 bg-slate-800/90 p-2 sm:p-3 rounded-lg border border-slate-700 sticky top-0 z-20 backdrop-blur-md shadow-md">
      {/* Row 1: Search, Filters & Action Buttons */}
      <div className="flex items-center justify-between gap-2 sm:gap-3">
        {/* Left: Search & Filter Tools */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Search Input */}
          <div className="relative group flex-shrink-0">
            <Search className="absolute left-2 sm:left-2.5 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索..."
              className="w-24 focus:w-36 sm:w-32 sm:focus:w-48 md:w-48 bg-slate-900 border border-slate-700 rounded-md pl-7 sm:pl-9 pr-7 sm:pr-8 py-1 sm:py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/20 transition-all"
            />
            {searchQuery && (
              <button
                onClick={handleClearSearch}
                className="absolute right-1 sm:right-1.5 top-1/2 transform -translate-y-1/2 p-0.5 hover:bg-slate-700 rounded text-slate-500 hover:text-slate-300 transition-colors"
                title="清除搜索"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="h-4 w-px bg-slate-700/50 hidden sm:block"></div>

          {/* Issue Filter */}
          <div className="relative flex-shrink-0" ref={issueFilterRef}>
            <button
              onClick={toggleIssueFilter}
              className={`flex items-center space-x-1 sm:space-x-1.5 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-md text-xs transition-all border ${
                activeIssueFilterCount > 0
                  ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300'
                  : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white hover:border-slate-600'
              }`}
              title="过滤问题"
            >
              <Filter className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              <span className="hidden sm:inline">问题</span>
              {activeIssueFilterCount > 0 && (
                <span className="bg-indigo-500 text-white text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0.5 rounded-full font-medium">
                  {activeIssueFilterCount}
                </span>
              )}
              <ChevronDown
                className={`w-2.5 h-2.5 sm:w-3 sm:h-3 transition-transform ${isIssueFilterOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {isIssueFilterOpen && (
              <div
                className={`absolute left-0 bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-30 min-w-[180px] py-1 animate-fade-in ${
                  issueDropUp
                    ? 'bottom-full mb-1.5 origin-bottom-left'
                    : 'top-full mt-1.5 origin-top-left'
                }`}
              >
                {/* Duration Filter */}
                <button
                  onClick={() => toggleFilter('duration')}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-slate-800 transition-colors"
                >
                  <div className="flex items-center space-x-2">
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    <span className={filters.duration ? 'text-amber-300' : 'text-slate-300'}>
                      时间过长
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    {issueCounts && (
                      <span className="text-slate-500 text-[10px]">({issueCounts.duration})</span>
                    )}
                    {filters.duration ? (
                      <CheckSquare className="w-4 h-4 text-indigo-400" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-600" />
                    )}
                  </div>
                </button>

                {/* Length Filter */}
                <button
                  onClick={() => toggleFilter('length')}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-slate-800 transition-colors"
                >
                  <div className="flex items-center space-x-2">
                    <Type className="w-3.5 h-3.5 text-rose-400" />
                    <span className={filters.length ? 'text-rose-300' : 'text-slate-300'}>
                      字符过多
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    {issueCounts && (
                      <span className="text-slate-500 text-[10px]">({issueCounts.length})</span>
                    )}
                    {filters.length ? (
                      <CheckSquare className="w-4 h-4 text-indigo-400" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-600" />
                    )}
                  </div>
                </button>

                {/* Overlap Filter */}
                <button
                  onClick={() => toggleFilter('overlap')}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-slate-800 transition-colors"
                >
                  <div className="flex items-center space-x-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-orange-400" />
                    <span className={filters.overlap ? 'text-orange-300' : 'text-slate-300'}>
                      时间重叠
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    {issueCounts && (
                      <span className="text-slate-500 text-[10px]">({issueCounts.overlap})</span>
                    )}
                    {filters.overlap ? (
                      <CheckSquare className="w-4 h-4 text-indigo-400" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-600" />
                    )}
                  </div>
                </button>

                {/* Clear Issues */}
                {activeIssueFilterCount > 0 && (
                  <>
                    <div className="border-t border-slate-700 my-1" />
                    <button
                      onClick={clearIssueFilters}
                      className="w-full flex items-center justify-center px-3 py-2 text-xs text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                    >
                      <X className="w-3 h-3 mr-1" />
                      清除问题筛选
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Speaker Filter */}
          {speakerProfiles && speakerProfiles.length > 0 && (
            <div className="relative flex-shrink-0" ref={speakerFilterRef}>
              <button
                onClick={toggleSpeakerFilter}
                className={`flex items-center space-x-1 sm:space-x-1.5 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-md text-xs transition-all border ${
                  activeSpeakerFilterCount > 0
                    ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300'
                    : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white hover:border-slate-600'
                }`}
                title="筛选说话人"
              >
                <User className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                <span className="hidden sm:inline">说话人</span>
                {activeSpeakerFilterCount > 0 && (
                  <span className="bg-indigo-500 text-white text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0.5 rounded-full font-medium">
                    {activeSpeakerFilterCount}
                  </span>
                )}
                <ChevronDown
                  className={`w-2.5 h-2.5 sm:w-3 sm:h-3 transition-transform ${isSpeakerFilterOpen ? 'rotate-180' : ''}`}
                />
              </button>

              {isSpeakerFilterOpen && (
                <div
                  className={`absolute left-0 bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-30 min-w-[200px] max-h-[60vh] overflow-y-auto py-1 animate-fade-in ${
                    speakerDropUp
                      ? 'bottom-full mb-1.5 origin-bottom-left'
                      : 'top-full mt-1.5 origin-top-left'
                  }`}
                >
                  {speakerProfiles.map((profile) => (
                    <button
                      key={profile.id}
                      onClick={() => toggleSpeaker(profile.name)}
                      className="w-full flex items-center justify-between px-3 py-1.5 text-xs hover:bg-slate-800 transition-colors"
                    >
                      <div className="flex items-center space-x-2 overflow-hidden">
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: getSpeakerColor(profile.name) }}
                        />
                        <span
                          className={`truncate ${
                            filters.speakers.has(profile.name)
                              ? 'text-indigo-300'
                              : 'text-slate-300'
                          }`}
                        >
                          {profile.name}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2 pl-2 flex-shrink-0">
                        {speakerCounts && speakerCounts[profile.name] !== undefined && (
                          <span className="text-slate-500 text-[10px]">
                            ({speakerCounts[profile.name]})
                          </span>
                        )}
                        {filters.speakers.has(profile.name) ? (
                          <CheckSquare className="w-4 h-4 text-indigo-400" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-600" />
                        )}
                      </div>
                    </button>
                  ))}

                  {/* Clear Speakers */}
                  {activeSpeakerFilterCount > 0 && (
                    <>
                      <div className="border-t border-slate-700 my-1" />
                      <button
                        onClick={clearSpeakerFilters}
                        className="w-full flex items-center justify-center px-3 py-2 text-xs text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                      >
                        <X className="w-3 h-3 mr-1" />
                        清除说话人筛选
                      </button>
                    </>
                  )}

                  {/* Manage Speakers */}
                  {onManageSpeakers && (
                    <>
                      <div className="border-t border-slate-700 my-1" />
                      <button
                        onClick={() => {
                          onManageSpeakers();
                          setIsSpeakerFilterOpen(false);
                        }}
                        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs text-indigo-400 hover:text-indigo-300 hover:bg-slate-800 transition-colors"
                      >
                        <Users className="w-3 h-3" />
                        管理说话人
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
          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            {/* Conservative Mode Toggle */}
            {onToggleConservativeMode && (
              <button
                onClick={onToggleConservativeMode}
                title={
                  conservativeBatchMode
                    ? '保守模式：仅微调时间轴，不拆分/合并'
                    : '普通模式：AI可拆分/合并长段落'
                }
                className={`flex items-center space-x-1 sm:space-x-1.5 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-md text-xs transition-all border ${
                  conservativeBatchMode
                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                    : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white hover:border-slate-600'
                }`}
              >
                <Shield className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                <span className="hidden sm:inline">{conservativeBatchMode ? '保守' : '普通'}</span>
              </button>
            )}

            {file && (
              <button
                onClick={() => handleBatchAction('fix_timestamps')}
                disabled={selectedBatches.size === 0}
                title="校对时间轴 (保留翻译)"
                className={`flex items-center space-x-1 sm:space-x-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-md text-xs font-bold transition-all shadow-sm border ${selectedBatches.size > 0 ? 'bg-slate-700 border-slate-600 text-emerald-400 hover:bg-slate-600 hover:border-emerald-400/50' : 'bg-slate-800 border-slate-800 text-slate-600 cursor-not-allowed'}`}
              >
                <Clock className="w-3 h-3" />
                <span className="hidden sm:inline">校对时间轴</span>
              </button>
            )}

            <button
              onClick={() => handleBatchAction('proofread')}
              disabled={selectedBatches.size === 0}
              title="润色翻译 (保留时间轴)"
              className={`flex items-center space-x-1 sm:space-x-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-md text-xs font-bold transition-all shadow-sm border ${selectedBatches.size > 0 ? 'bg-indigo-600 border-indigo-500 text-white hover:bg-indigo-500' : 'bg-slate-800 border-slate-800 text-slate-600 cursor-not-allowed'}`}
            >
              <Sparkles className="w-3 h-3" />
              <span className="hidden sm:inline">润色翻译</span>
            </button>
          </div>
        )}
      </div>

      {/* Row 2: Batch Selection & Status */}
      <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3 pt-2 border-t border-slate-700/50">
        {/* Selection Tools */}
        <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto">
          {isDeleteMode ? (
            /* Delete Mode Selection */
            <>
              <button
                onClick={onSelectAllForDelete}
                className="flex items-center space-x-1.5 sm:space-x-2 text-xs text-red-300 hover:text-red-200 transition-colors"
              >
                {selectedForDeleteCount === totalVisibleCount && totalVisibleCount! > 0 ? (
                  <CheckSquare className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-400" />
                ) : (
                  <Square className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-400" />
                )}
                <span>全选</span>
              </button>

              <div className="h-4 w-px bg-slate-700/50"></div>

              <button
                onClick={onConfirmDelete}
                disabled={!selectedForDeleteCount || selectedForDeleteCount === 0}
                className={`flex items-center space-x-1 sm:space-x-1.5 px-2 sm:px-3 py-1 rounded-md text-xs font-bold transition-all shadow-sm border ${
                  selectedForDeleteCount && selectedForDeleteCount > 0
                    ? 'bg-red-600 border-red-500 text-white hover:bg-red-500'
                    : 'bg-slate-800 border-slate-700 text-slate-500 cursor-not-allowed'
                }`}
              >
                <Trash2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                <span>删除 ({selectedForDeleteCount || 0})</span>
              </button>

              <button
                onClick={onToggleDeleteMode}
                className="flex items-center space-x-1 text-xs text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                <span className="hidden sm:inline">取消</span>
              </button>
            </>
          ) : (
            /* Normal Selection */
            <>
              <button
                onClick={() => toggleAllBatches(chunks.length)}
                className="flex items-center space-x-1.5 sm:space-x-2 text-xs sm:text-sm text-slate-300 hover:text-white transition-colors"
              >
                {selectedBatches.size === chunks.length ? (
                  <CheckSquare className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-indigo-400" />
                ) : (
                  <Square className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-500" />
                )}
                <span>{selectedBatches.size === chunks.length ? '取消全选' : '全选'}</span>
              </button>

              <button
                onClick={() => selectBatchesWithComments(chunks)}
                className="flex items-center space-x-1.5 sm:space-x-2 text-xs sm:text-sm text-slate-300 hover:text-white transition-colors"
                title="选择带评论项"
              >
                <MessageCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400" />
                <span className="hidden sm:inline">选择带评论项</span>
              </button>

              <div className="h-4 w-px bg-slate-700/50 hidden sm:block"></div>

              <button
                onClick={() => setShowSourceText(!showSourceText)}
                className="flex items-center space-x-1.5 sm:space-x-2 text-xs sm:text-sm text-slate-400 hover:text-white transition-colors"
              >
                {showSourceText ? (
                  <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                ) : (
                  <EyeOff className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                )}
                <span className="hidden sm:inline">{showSourceText ? '隐藏原文' : '显示原文'}</span>
              </button>
            </>
          )}
        </div>

        {/* Right: Status / Delete Toggle */}
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          {!isDeleteMode && (
            <>
              {onToggleDeleteMode && (
                <button
                  onClick={onToggleDeleteMode}
                  className="flex items-center space-x-1 sm:space-x-1.5 text-xs sm:text-sm text-red-400 hover:text-red-300 transition-colors opacity-80 hover:opacity-100"
                  title="批量删除"
                >
                  <Trash2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  <span className="hidden sm:inline">批量删除</span>
                </button>
              )}

              {onToggleDeleteMode && (
                <div className="h-4 w-px bg-slate-700/50 hidden sm:block"></div>
              )}

              <span className="text-xs sm:text-sm text-slate-500 font-mono whitespace-nowrap">
                已选 {selectedBatches.size} 项
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
