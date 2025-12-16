import React from 'react';
import {
  MessageCircle,
  Pencil,
  Clock,
  Type,
  AlertTriangle,
  Trash2,
  CheckSquare,
  Square,
  Plus,
  MoreVertical,
  ChevronRight,
} from 'lucide-react';
import { SubtitleItem } from '@/types';
import { SpeakerUIProfile } from '@/types/speaker';
import { SpeakerSelect } from '@/components/editor/SpeakerSelect';
import { cn } from '@/lib/cn';

// Validation thresholds (from prompts.ts rules)
const MAX_DURATION_SECONDS = 5;
const MAX_CHINESE_CHARACTERS = 25;

// Parse time string (HH:MM:SS,mmm or HH:MM:SS.mmm) to seconds
export const parseTimeToSeconds = (timeStr: string): number => {
  if (!timeStr) return 0;
  const parts = timeStr.replace(',', '.').split(':');
  if (parts.length !== 3) return 0;
  const hours = parseFloat(parts[0]) || 0;
  const minutes = parseFloat(parts[1]) || 0;
  const seconds = parseFloat(parts[2]) || 0;
  return hours * 3600 + minutes * 60 + seconds;
};

// Format seconds to time string (HH:MM:SS,mmm)
const formatSecondsToTime = (totalSeconds: number): string => {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const secs = Math.floor(seconds);
  const ms = Math.round((seconds - secs) * 1000);
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
};

// Validate time format and return normalized string or null
const validateAndNormalizeTime = (input: string): string | null => {
  // Try to parse various formats: HH:MM:SS, HH:MM:SS,mmm, HH:MM:SS.mmm, MM:SS
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Handle MM:SS format
  const shortMatch = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (shortMatch) {
    const mins = parseInt(shortMatch[1]);
    const secs = parseInt(shortMatch[2]);
    return formatSecondsToTime(mins * 60 + secs);
  }

  // Handle HH:MM:SS or HH:MM:SS,mmm or HH:MM:SS.mmm
  const fullMatch = trimmed.match(/^(\d{1,2}):(\d{2}):(\d{2})([,.](\d{1,3}))?$/);
  if (fullMatch) {
    const hours = parseInt(fullMatch[1]);
    const mins = parseInt(fullMatch[2]);
    const secs = parseInt(fullMatch[3]);
    const ms = fullMatch[5] ? parseInt(fullMatch[5].padEnd(3, '0')) : 0;
    return formatSecondsToTime(hours * 3600 + mins * 60 + secs + ms / 1000);
  }

  return null;
};

// Calculate subtitle duration in seconds
const calculateDuration = (startTime: string, endTime: string): number => {
  return parseTimeToSeconds(endTime) - parseTimeToSeconds(startTime);
};

// Count Chinese characters (CJK range)
const countChineseCharacters = (text: string): number => {
  if (!text) return 0;
  const cjkRegex =
    /[\u4e00-\u9fff\u3400-\u4dbf\u{20000}-\u{2a6df}\u{2a700}-\u{2b73f}\u{2b740}-\u{2b81f}\u{2b820}-\u{2ceaf}\u{2ceb0}-\u{2ebef}]/gu;
  const matches = text.match(cjkRegex);
  return matches ? matches.length : 0;
};

// Overlap threshold in seconds (only show warning if overlap > this value)
const OVERLAP_THRESHOLD_SECONDS = 2;

// Validation result type
export interface ValidationResult {
  hasDurationIssue: boolean;
  hasLengthIssue: boolean;
  hasOverlapIssue: boolean;
  duration: number;
  charCount: number;
  overlapAmount: number; // How many seconds of overlap (negative means gap)
}

// Validate a subtitle item
export const validateSubtitle = (sub: SubtitleItem, prevEndTime?: string): ValidationResult => {
  const duration = calculateDuration(sub.startTime, sub.endTime);
  const charCount = countChineseCharacters(sub.translated);

  // Check overlap: current start time < previous end time
  let overlapAmount = 0;
  if (prevEndTime) {
    const prevEnd = parseTimeToSeconds(prevEndTime);
    const currentStart = parseTimeToSeconds(sub.startTime);
    overlapAmount = prevEnd - currentStart; // Positive means overlap
  }

  // Only flag as issue if overlap exceeds threshold
  const hasOverlapIssue = overlapAmount > OVERLAP_THRESHOLD_SECONDS;

  return {
    hasDurationIssue: duration > MAX_DURATION_SECONDS,
    hasLengthIssue: charCount > MAX_CHINESE_CHARACTERS,
    hasOverlapIssue,
    duration,
    charCount,
    overlapAmount,
  };
};

interface SubtitleRowProps {
  sub: SubtitleItem;
  showSourceText: boolean;
  editingCommentId: string | null;
  setEditingCommentId: (id: string | null) => void;
  updateLineComment: (id: string, comment: string) => void;
  updateSubtitleText: (id: string, translated: string) => void;
  updateSubtitleOriginal: (id: string, original: string) => void;
  updateSpeaker?: (id: string, speaker: string, applyToAll?: boolean) => void;
  updateSubtitleTime?: (id: string, startTime: string, endTime: string) => void;
  prevEndTime?: string; // For overlap detection
  speakerProfiles?: SpeakerUIProfile[];
  onManageSpeakers?: () => void;
  deleteSubtitle?: (id: string) => void;
  // Delete mode
  isDeleteMode?: boolean;
  isSelectedForDelete?: boolean;
  onToggleDeleteSelection?: (id: string) => void;
  // Add subtitle
  addSubtitle?: (referenceId: string, position: 'before' | 'after', defaultTime: string) => void;
}

export const SubtitleRow: React.FC<SubtitleRowProps> = React.memo(
  ({
    sub,
    showSourceText,
    editingCommentId,
    setEditingCommentId,
    updateLineComment,
    updateSubtitleText,
    updateSubtitleOriginal,
    updateSpeaker,
    updateSubtitleTime,
    prevEndTime,
    speakerProfiles,
    onManageSpeakers,
    deleteSubtitle,
    // Delete mode
    isDeleteMode,
    isSelectedForDelete,
    onToggleDeleteSelection,
    // Add subtitle
    addSubtitle,
  }) => {
    const [editing, setEditing] = React.useState(false);
    const [tempText, setTempText] = React.useState('');
    const [tempOriginal, setTempOriginal] = React.useState('');
    const [tempStartTime, setTempStartTime] = React.useState('');
    const [tempEndTime, setTempEndTime] = React.useState('');
    const [editingSpeaker, setEditingSpeaker] = React.useState(false);
    const [tempSpeaker, setTempSpeaker] = React.useState('');
    const [showAddMenu, setShowAddMenu] = React.useState(false);
    const [showAddSubmenu, setShowAddSubmenu] = React.useState(false);
    const [menuDropUp, setMenuDropUp] = React.useState(false);
    const [submenuDropLeft, setSubmenuDropLeft] = React.useState(false);
    const addMenuRef = React.useRef<HTMLDivElement>(null);

    // Close add menu when clicking outside
    React.useEffect(() => {
      if (!showAddMenu) return;
      const handleClickOutside = (e: MouseEvent) => {
        if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
          setShowAddMenu(false);
        }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showAddMenu]);

    React.useEffect(() => {
      if (!showAddMenu) setShowAddSubmenu(false);
    }, [showAddMenu]);

    // Toggle menu with smart direction detection
    const toggleMenu = () => {
      if (!showAddMenu) {
        if (addMenuRef.current) {
          const rect = addMenuRef.current.getBoundingClientRect();
          const spaceBelow = window.innerHeight - rect.bottom;
          // If less than 220px below, open upwards
          setMenuDropUp(spaceBelow < 220);
        }
      }
      setShowAddMenu(!showAddMenu);
    };

    // Calculate submenu direction on hover
    const handleSubmenuEnter = () => {
      if (addMenuRef.current) {
        const rect = addMenuRef.current.getBoundingClientRect();
        // If less than 130px to the left, open to the right
        setSubmenuDropLeft(rect.left > 130);
      }
      setShowAddSubmenu(true);
    };

    // Validate this subtitle
    const validation = React.useMemo(() => validateSubtitle(sub, prevEndTime), [sub, prevEndTime]);

    // Count total issues for background color
    const issueCount = [
      validation.hasDurationIssue,
      validation.hasLengthIssue,
      validation.hasOverlapIssue,
    ].filter(Boolean).length;

    // Determine background color based on validation issues
    const getRowBackgroundClass = (): string => {
      if (issueCount >= 2) {
        // Multiple issues: purple/violet background
        return 'bg-violet-900/30 border-l-2 border-violet-500';
      } else if (validation.hasOverlapIssue) {
        // Overlap issue: orange background
        return 'bg-orange-900/30 border-l-2 border-orange-500';
      } else if (validation.hasDurationIssue) {
        // Duration issue only: yellow background
        return 'bg-yellow-900/30 border-l-2 border-yellow-500';
      } else if (validation.hasLengthIssue) {
        // Length issue only: rose/red background
        return 'bg-rose-900/30 border-l-2 border-rose-500';
      }
      return '';
    };

    const handleStartEdit = () => {
      setTempText(sub.translated);
      setTempOriginal(sub.original);
      setTempStartTime(sub.startTime || ''); // Show full time with ms for precise editing
      setTempEndTime(sub.endTime || '');
      setEditing(true);
    };

    const handleSave = () => {
      if (tempText.trim() !== sub.translated) {
        updateSubtitleText(sub.id, tempText.trim());
      }
      if (showSourceText && tempOriginal.trim() !== sub.original) {
        updateSubtitleOriginal(sub.id, tempOriginal.trim());
      }
      // Save time if changed and valid
      if (updateSubtitleTime) {
        const normalizedStart = validateAndNormalizeTime(tempStartTime);
        const normalizedEnd = validateAndNormalizeTime(tempEndTime);
        if (normalizedStart && normalizedEnd) {
          const startChanged = normalizedStart !== sub.startTime;
          const endChanged = normalizedEnd !== sub.endTime;
          if (startChanged || endChanged) {
            updateSubtitleTime(sub.id, normalizedStart, normalizedEnd);
          }
        }
      }
      setEditing(false);
    };

    const handleCancel = () => {
      setEditing(false);
      setTempText('');
      setTempOriginal('');
      setTempStartTime('');
      setTempEndTime('');
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSave();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleCancel();
      }
    };

    const handleSpeakerSave = () => {
      if (updateSpeaker && tempSpeaker.trim() !== (sub.speaker || '')) {
        updateSpeaker(sub.id, tempSpeaker.trim());
      }
      setEditingSpeaker(false);
    };

    const handleSpeakerEdit = () => {
      setTempSpeaker(sub.speaker || '');
      setEditingSpeaker(true);
    };

    const handleSpeakerCancel = () => {
      setTempSpeaker('');
      setEditingSpeaker(false);
    };

    // Handle blur for the entire editing row
    const handleRowBlur = (e: React.FocusEvent<HTMLDivElement>) => {
      if (!editing) return;
      // Check if the new focus target is still within this row
      const rowElement = e.currentTarget;
      const relatedTarget = e.relatedTarget as Node | null;
      if (relatedTarget && rowElement.contains(relatedTarget)) {
        // Focus is still within the row, don't save
        return;
      }
      // Focus left the row, save changes
      handleSave();
    };

    return (
      <div
        className={cn(
          'p-2 sm:p-3 md:p-4 hover:bg-slate-800/30 transition-colors flex items-start space-x-2 sm:space-x-4 group/row',
          getRowBackgroundClass(),
          isDeleteMode && isSelectedForDelete && 'bg-red-900/20'
        )}
        onBlur={editing ? handleRowBlur : undefined}
      >
        {/* Delete mode checkbox */}
        {isDeleteMode && (
          <button onClick={() => onToggleDeleteSelection?.(sub.id)} className="mt-1 flex-shrink-0">
            {isSelectedForDelete ? (
              <CheckSquare className="w-4 h-4 sm:w-5 sm:h-5 text-red-400" />
            ) : (
              <Square className="w-4 h-4 sm:w-5 sm:h-5 text-red-400/50 hover:text-red-400" />
            )}
          </button>
        )}
        <div className="flex flex-col text-[11px] sm:text-sm font-mono text-slate-400 min-w-[75px] sm:min-w-[95px] pt-1">
          {editing ? (
            // Editable time inputs - compact style matching display
            <>
              <input
                type="text"
                value={tempStartTime}
                onChange={(e) => setTempStartTime(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="00:00:00"
                className="bg-transparent border-b border-slate-600 focus:border-indigo-500 px-0 py-0 text-[11px] sm:text-sm text-white placeholder-slate-600 focus:outline-none leading-tight w-full"
              />
              <input
                type="text"
                value={tempEndTime}
                onChange={(e) => setTempEndTime(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="00:00:00"
                className="bg-transparent border-b border-slate-600 focus:border-indigo-500 px-0 py-0 text-[11px] sm:text-sm text-white/70 placeholder-slate-600 focus:outline-none leading-tight w-full"
              />
            </>
          ) : (
            <>
              <span className="leading-tight">{(sub.startTime || '').split(',')[0]}</span>
              <span className="leading-tight opacity-70">{(sub.endTime || '').split(',')[0]}</span>
            </>
          )}
          {/* Validation indicators */}
          {!editing &&
            (validation.hasDurationIssue ||
              validation.hasLengthIssue ||
              validation.hasOverlapIssue) && (
              <div className="flex flex-wrap items-center gap-1 mt-1.5">
                {validation.hasOverlapIssue && (
                  <span
                    className="flex items-center gap-0.5 text-[10px] text-orange-400"
                    title={`与上一行重叠 ${validation.overlapAmount.toFixed(1)}s`}
                  >
                    <AlertTriangle className="w-3 h-3" />
                    <span>{validation.overlapAmount.toFixed(1)}s</span>
                  </span>
                )}
                {validation.hasDurationIssue && (
                  <span
                    className="flex items-center gap-0.5 text-[10px] text-yellow-400"
                    title={`持续时间 ${validation.duration.toFixed(1)}s 超过 ${MAX_DURATION_SECONDS}s`}
                  >
                    <Clock className="w-3 h-3" />
                    <span>{validation.duration.toFixed(1)}s</span>
                  </span>
                )}
                {validation.hasLengthIssue && (
                  <span
                    className="flex items-center gap-0.5 text-[10px] text-rose-400"
                    title={`字符数 ${validation.charCount} 超过 ${MAX_CHINESE_CHARACTERS} 字符`}
                  >
                    <Type className="w-3 h-3" />
                    <span>{validation.charCount}字</span>
                  </span>
                )}
              </div>
            )}
        </div>
        <div className="flex-1 space-y-1">
          {/* Speaker Select */}
          {sub.speaker && updateSpeaker && speakerProfiles && (
            <div className="mb-2">
              <SpeakerSelect
                currentSpeaker={sub.speaker}
                speakerProfiles={speakerProfiles}
                onSelect={(speaker) => updateSpeaker(sub.id, speaker)}
                onManageSpeakers={onManageSpeakers}
              />
            </div>
          )}
          {editing ? (
            <div className="space-y-1">
              {showSourceText && (
                <input
                  type="text"
                  value={tempOriginal}
                  onChange={(e) => setTempOriginal(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="原文"
                  className="w-full bg-slate-600/10 border border-slate-500/30 rounded px-2 py-1 text-xs sm:text-sm text-slate-300 placeholder-slate-500/50 focus:outline-none focus:border-slate-400/50 leading-relaxed"
                />
              )}
              <input
                type="text"
                value={tempText}
                onChange={(e) => setTempText(e.target.value)}
                onKeyDown={handleKeyDown}
                autoFocus
                placeholder="译文"
                className="w-full bg-indigo-500/10 border border-indigo-500/30 rounded px-2 py-1 text-base sm:text-lg text-indigo-200 placeholder-indigo-500/50 focus:outline-none focus:border-indigo-500/50 leading-relaxed font-medium"
              />
            </div>
          ) : (
            <>
              {showSourceText && (
                <p className="text-xs sm:text-sm text-slate-400 leading-relaxed opacity-70 mb-1">
                  {sub.original}
                </p>
              )}
              <p className="text-base sm:text-lg text-indigo-300 leading-relaxed font-medium">
                {sub.translated}
              </p>
            </>
          )}
          {(editingCommentId === sub.id || sub.comment) && (
            <div className="mt-2 flex items-start animate-fade-in">
              <MessageCircle className="w-3 h-3 text-amber-500 mt-1 mr-2 flex-shrink-0" />
              <input
                type="text"
                value={sub.comment || ''}
                onChange={(e) => updateLineComment(sub.id, e.target.value)}
                placeholder="添加具体修改说明..."
                autoFocus={editingCommentId === sub.id}
                onBlur={() => setEditingCommentId(null)}
                className="w-full bg-amber-500/10 border border-amber-500/20 rounded px-2 py-1 text-sm text-amber-200 placeholder-amber-500/50 focus:outline-none focus:border-amber-500/50"
              />
            </div>
          )}
        </div>
        <div className="flex items-center">
          <div className="relative" ref={addMenuRef}>
            <button
              onClick={toggleMenu}
              className={cn(
                'p-1.5 rounded hover:bg-slate-700 transition-colors',
                showAddMenu
                  ? 'text-slate-300'
                  : 'text-slate-600 opacity-0 group-hover/row:opacity-100'
              )}
              title="更多操作"
            >
              <MoreVertical className="w-6 h-6" />
            </button>
            {showAddMenu && (
              <div
                className={cn(
                  'absolute right-0 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 py-1 min-w-[130px]',
                  menuDropUp ? 'bottom-full mb-1' : 'top-full mt-1'
                )}
              >
                {/* 1. 编辑行 */}
                <button
                  onClick={() => {
                    handleStartEdit();
                    setShowAddMenu(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-700 hover:text-indigo-400 transition-colors flex items-center gap-2"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  编辑行
                </button>
                {/* 2. 添加新行 (submenu) */}
                {addSubtitle && (
                  <div
                    className="relative"
                    onMouseEnter={handleSubmenuEnter}
                    onMouseLeave={() => setShowAddSubmenu(false)}
                  >
                    <button className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-700 hover:text-emerald-400 transition-colors flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <Plus className="w-3.5 h-3.5" />
                        添加新行
                      </span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                    {showAddSubmenu && (
                      <div
                        className={cn(
                          'absolute top-0 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 py-1 min-w-[110px]',
                          submenuDropLeft ? 'right-full mr-1' : 'left-full ml-1'
                        )}
                      >
                        <button
                          onClick={() => {
                            addSubtitle(sub.id, 'before', sub.startTime);
                            setShowAddMenu(false);
                          }}
                          className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-700 hover:text-emerald-400 transition-colors"
                        >
                          在前面添加
                        </button>
                        <button
                          onClick={() => {
                            addSubtitle(sub.id, 'after', sub.endTime);
                            setShowAddMenu(false);
                          }}
                          className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-700 hover:text-emerald-400 transition-colors"
                        >
                          在后面添加
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {/* 3. 添加评论 */}
                <button
                  onClick={() => {
                    setEditingCommentId(sub.id);
                    setShowAddMenu(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-700 hover:text-amber-400 transition-colors flex items-center gap-2"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  添加评论
                </button>
                {/* 4. 删除行 (red) */}
                {deleteSubtitle && (
                  <>
                    <div className="border-t border-slate-700 my-1" />
                    <button
                      onClick={() => {
                        deleteSubtitle(sub.id);
                        setShowAddMenu(false);
                      }}
                      className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-slate-700 hover:text-red-300 transition-colors flex items-center gap-2"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      删除行
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  },
  (prev, next) => {
    return (
      prev.sub === next.sub &&
      prev.showSourceText === next.showSourceText &&
      prev.editingCommentId === next.editingCommentId &&
      prev.speakerProfiles === next.speakerProfiles &&
      prev.deleteSubtitle === next.deleteSubtitle &&
      prev.addSubtitle === next.addSubtitle &&
      prev.isDeleteMode === next.isDeleteMode &&
      prev.isSelectedForDelete === next.isSelectedForDelete &&
      // Functions are usually stable if from useWorkspaceLogic, but if not, this might cause issues.
      // However, since we plan to memoize handlers in useWorkspaceLogic, strict equality check is fine.
      // But for editingCommentId, we only care if it matches THIS row's ID.
      (prev.editingCommentId === prev.sub.id) === (next.editingCommentId === next.sub.id)
    );
  }
);
