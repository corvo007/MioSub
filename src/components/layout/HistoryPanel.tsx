import React, { useState, useMemo } from 'react';
import { X, GitCommit, RotateCcw, Trash2, ChevronDown, ChevronRight, Search } from 'lucide-react';
import { SubtitleSnapshot } from '@/types/subtitle';

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
        fileName: snaps[0]?.fileName || '未知文件',
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
  }, [snapshots, searchQuery]);

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
        className="absolute top-2 right-4 text-slate-400 hover:text-white z-10"
      >
        <X className="w-4 h-4" />
      </button>

      <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
        <GitCommit className="w-5 h-5 text-indigo-400" />
        快照记录
      </h2>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          type="text"
          placeholder="搜索文件名或描述..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-9 pr-4 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
        />
      </div>

      {/* Grouped Snapshots */}
      {groupedSnapshots.length === 0 ? (
        <div className="text-center py-8 text-slate-500 text-sm">暂无快照</div>
      ) : (
        <div className="space-y-3">
          {groupedSnapshots.map((group) => {
            const isExpanded = expandedGroups.has(group.fileId);
            return (
              <div
                key={group.fileId}
                className="border border-slate-700 rounded-xl overflow-hidden"
              >
                {/* Group Header */}
                <button
                  onClick={() => toggleGroup(group.fileId)}
                  className="w-full px-4 py-3 bg-slate-800/50 flex items-center justify-between text-sm font-medium text-slate-300 hover:bg-slate-800"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 flex-shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 flex-shrink-0" />
                    )}
                    <div className="min-w-0 text-left">
                      <div className="truncate font-medium">{group.fileName}</div>
                      <div className="text-xs text-slate-500 truncate">{group.fileId}</div>
                    </div>
                  </div>
                  <span className="text-xs text-indigo-400 bg-indigo-500/20 px-1.5 py-0.5 rounded ml-2 flex-shrink-0">
                    {group.snapshots.length}
                  </span>
                </button>

                {/* Snapshot Items */}
                {isExpanded && (
                  <div className="p-3 space-y-2">
                    {group.snapshots.map((snap) => (
                      <div
                        key={snap.id}
                        className="bg-slate-800/30 border border-slate-700/50 p-3 rounded-lg"
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-slate-200 text-sm">
                              {snap.description}
                            </h4>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {snap.subtitles.length} 行字幕 · {snap.timestamp}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 ml-2">
                            <button
                              onClick={() => onRestoreSnapshot(snap)}
                              className="px-2.5 py-1.5 bg-slate-700 hover:bg-indigo-600 rounded text-xs text-white transition-colors flex items-center gap-1"
                            >
                              <RotateCcw className="w-3 h-3" /> 加载
                            </button>
                            <button
                              onClick={() => onDeleteSnapshot(snap.id)}
                              className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                              title="删除"
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
