import React, { useState, useMemo } from 'react';
import {
  GitCommit,
  RotateCcw,
  Trash2,
  ChevronDown,
  ChevronRight,
  Search,
  Clock,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { type SubtitleSnapshot } from '@/types/subtitle';
import { Modal } from '@/components/ui/Modal';

interface HistoryModalProps {
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

export const HistoryModal: React.FC<HistoryModalProps> = ({
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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('history.title')}
      icon={<Clock className="w-5 h-5 text-brand-purple" />}
      maxWidth="3xl"
      contentClassName="p-0"
    >
      <div className="flex flex-col h-[70vh]">
        {/* Search */}
        <div className="p-4 border-b border-slate-200/60 bg-slate-50/50">
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
        </div>

        {/* Grouped Snapshots List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar bg-white/50">
          {groupedSnapshots.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-sm">
              {t('history.noSnapshots')}
            </div>
          ) : (
            <div className="space-y-3">
              {groupedSnapshots.map((group) => {
                const isExpanded = expandedGroups.has(group.fileId);
                return (
                  <div
                    key={group.fileId}
                    className="border border-slate-200/60 rounded-xl overflow-hidden shadow-sm bg-white"
                  >
                    {/* Group Header */}
                    <button
                      onClick={() => toggleGroup(group.fileId)}
                      className="w-full px-4 py-3 bg-slate-50/50 flex items-center justify-between text-sm font-medium text-slate-700 hover:bg-slate-100/80 transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 shrink-0 text-slate-400" />
                        ) : (
                          <ChevronRight className="w-4 h-4 shrink-0 text-slate-400" />
                        )}
                        <div className="min-w-0 text-left">
                          <div className="truncate font-medium text-slate-800">
                            {group.fileName}
                          </div>
                          {group.fileId !== group.fileName && (
                            <div
                              className="text-xs text-slate-500 truncate font-mono opacity-80"
                              title={group.fileId}
                            >
                              {group.fileId}
                            </div>
                          )}
                        </div>
                      </div>
                      <span className="text-xs text-brand-purple bg-brand-purple/10 px-2 py-0.5 rounded-full ml-2 shrink-0 font-semibold border border-brand-purple/10">
                        {group.snapshots.length}
                      </span>
                    </button>

                    {/* Snapshot Items */}
                    {isExpanded && (
                      <div className="p-3 space-y-2 bg-slate-50/30">
                        {group.snapshots.map((snap) => (
                          <div
                            key={snap.id}
                            className="bg-white border border-slate-100 p-3 rounded-lg hover:shadow-md hover:border-brand-purple/20 transition-all group"
                          >
                            <div className="flex justify-between items-start">
                              <div className="flex-1 min-w-0">
                                <h4 className="font-medium text-slate-800 text-sm flex items-center gap-2">
                                  <GitCommit className="w-3.5 h-3.5 text-slate-400" />
                                  {snap.description}
                                </h4>
                                <p className="text-xs text-slate-500 mt-1 pl-5.5">
                                  {t('history.subtitleInfo', {
                                    count: snap.subtitles.length,
                                    timestamp: snap.timestamp,
                                  })}
                                </p>
                              </div>
                              <div className="flex items-center gap-1 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => onRestoreSnapshot(snap)}
                                  className="px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-brand-purple hover:border-brand-purple hover:text-white rounded-lg text-xs text-slate-600 transition-all flex items-center gap-1.5 shadow-sm"
                                  title={t('history.load')}
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                  <span className="hidden sm:inline">{t('history.load')}</span>
                                </button>
                                <button
                                  onClick={() => onDeleteSnapshot(snap.id)}
                                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100"
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
      </div>
    </Modal>
  );
};
