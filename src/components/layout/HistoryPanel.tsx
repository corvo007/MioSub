import React, { useState, useMemo } from 'react';
import { X, GitCommit, RotateCcw, Trash2, ChevronDown, ChevronRight, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { type SubtitleSnapshot } from '@/types/subtitle';

interface HistoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  snapshots: SubtitleSnapshot[];
  onRestoreSnapshot: (snapshot: SubtitleSnapshot) => void;
  onDeleteSnapshot: (id: string) => void;
}

interface GroupedSnapshots {
  fileId: string;
  fileName: string;
  snapshots: SubtitleSnapshot[];
}

export const HistoryPanel: React.FC<HistoryPanelProps> = ({
  isOpen,
  onClose,
  snapshots,
  onRestoreSnapshot,
  onDeleteSnapshot,
}) => {
  const { t } = useTranslation('ui');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Filter and group snapshots by fileId
  const groupedSnapshots = useMemo(() => {
    // Filter by search query
    const filtered = snapshots.filter((snap) => {
      const query = searchQuery.toLowerCase();
      return (
        snap.description.toLowerCase().includes(query) ||
        snap.fileName?.toLowerCase().includes(query) ||
        snap.fileId?.toLowerCase().includes(query)
      );
    });

    // Sort by timestamp (newest first)
    const sorted = [...filtered].sort((a, b) => {
      return parseInt(b.id) - parseInt(a.id);
    });

    // Group by fileId
    const groups = new Map<string, SubtitleSnapshot[]>();
    sorted.forEach((snap) => {
      const key = snap.fileId || 'unknown';
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(snap);
    });

    // Convert to array, sort by most recent snapshot in each group
    const result: GroupedSnapshots[] = [];
    groups.forEach((snaps, fileId) => {
      result.push({
        fileId,

        fileName: snaps[0]?.fileName || t('history.unknownFile'),
        snapshots: snaps,
      });
    });

    // Sort groups by most recent snapshot
    result.sort((a, b) => {
      const aLatest = parseInt(a.snapshots[0]?.id || '0');
      const bLatest = parseInt(b.snapshots[0]?.id || '0');
      return bLatest - aLatest;
    });

    return result;
  }, [snapshots, searchQuery, t]);

  const toggleGroup = (fileId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) {
        next.delete(fileId);
      } else {
        next.add(fileId);
      }
      return next;
    });
  };

  // Auto-expand first group on initial load
  React.useEffect(() => {
    if (groupedSnapshots.length > 0 && expandedGroups.size === 0) {
      setExpandedGroups(new Set([groupedSnapshots[0].fileId]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupedSnapshots.length]);

  if (!isOpen) return null;

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar w-full relative">
      <button
        onClick={onClose}
        className="absolute top-2 right-4 text-slate-400 hover:text-slate-700 z-10 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>

      <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 mb-4">
        <GitCommit className="w-5 h-5 text-brand-purple" />
        {t('history.title')}
      </h2>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          type="text"
          placeholder={t('history.searchPlaceholder')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-purple/20 focus:border-brand-purple transition-all shadow-sm"
        />
      </div>

      {/* Grouped Snapshots */}
      {groupedSnapshots.length === 0 ? (
        <div className="text-center py-8 text-slate-500 text-sm">{t('history.noSnapshots')}</div>
      ) : (
        <div className="space-y-3">
          {groupedSnapshots.map((group) => {
            const isExpanded = expandedGroups.has(group.fileId);
            return (
              <div
                key={group.fileId}
                className="border border-slate-200 rounded-xl overflow-hidden shadow-sm"
              >
                {/* Group Header */}
                <button
                  onClick={() => toggleGroup(group.fileId)}
                  className="w-full px-4 py-3 bg-slate-50 flex items-center justify-between text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 shrink-0" />
                    )}
                    <div className="min-w-0 text-left">
                      <div className="truncate font-medium">{group.fileName}</div>
                      <div className="text-xs text-slate-500 truncate">{group.fileId}</div>
                    </div>
                  </div>
                  <span className="text-xs text-brand-purple bg-brand-purple/10 px-1.5 py-0.5 rounded ml-2 shrink-0 font-semibold">
                    {group.snapshots.length}
                  </span>
                </button>

                {/* Snapshot Items */}
                {isExpanded && (
                  <div className="p-3 space-y-2">
                    {group.snapshots.map((snap) => (
                      <div
                        key={snap.id}
                        className="bg-white border border-slate-100 p-3 rounded-lg hover:shadow-sm transition-all"
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-slate-800 text-sm">
                              {snap.description}
                            </h4>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {t('history.subtitleInfo', {
                                count: snap.subtitles.length,
                                timestamp: snap.timestamp,
                              })}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 ml-2">
                            <button
                              onClick={() => onRestoreSnapshot(snap)}
                              className="px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-brand-purple hover:border-brand-purple hover:text-white rounded text-xs text-slate-600 transition-all flex items-center gap-1 shadow-sm"
                            >
                              <RotateCcw className="w-3 h-3" /> {t('history.load')}
                            </button>
                            <button
                              onClick={() => onDeleteSnapshot(snap.id)}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                              title={t('history.delete')}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
