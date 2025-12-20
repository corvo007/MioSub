import React from 'react';
import {
  X,
  Users,
  Pencil,
  Trash2,
  GitMerge,
  Check,
  User,
  Plus,
  Square,
  CheckSquare,
  Loader2,
} from 'lucide-react';
import { type SpeakerUIProfile } from '@/types/speaker';
import { getSpeakerColor } from '@/services/utils/colors';
import { SimpleConfirmationModal } from '@/components/modals/SimpleConfirmationModal';
import { cn } from '@/lib/cn';

interface SpeakerManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  speakerProfiles: SpeakerUIProfile[];
  speakerCounts?: Record<string, number>; // 每个说话人的字幕条数
  onRename: (id: string, newName: string) => void;
  onDelete: (id: string) => void;
  onMerge: (sourceIds: string[], targetId: string) => void;
  onCreate?: (name: string) => string;
}

export const SpeakerManagerModal: React.FC<SpeakerManagerModalProps> = ({
  isOpen,
  onClose,
  speakerProfiles,
  speakerCounts,
  onRename,
  onDelete,
  onMerge,
  onCreate,
}) => {
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editName, setEditName] = React.useState('');
  const [mergeMode, setMergeMode] = React.useState(false);
  const [selectedForMerge, setSelectedForMerge] = React.useState<Set<string>>(new Set());
  const [isCreating, setIsCreating] = React.useState(false);
  const [newSpeakerName, setNewSpeakerName] = React.useState('');
  const [isProcessing, setIsProcessing] = React.useState(false);

  // Delete confirmation state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);
  const [deleteCandidateId, setDeleteCandidateId] = React.useState<string | null>(null);
  const deleteCandidateName = React.useMemo(() => {
    if (!deleteCandidateId) return '';
    return speakerProfiles.find((p) => p.id === deleteCandidateId)?.name || '';
  }, [deleteCandidateId, speakerProfiles]);

  const handleDeleteClick = (profileId: string) => {
    setDeleteCandidateId(profileId);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = () => {
    if (deleteCandidateId) {
      onDelete(deleteCandidateId);
    }
    setDeleteConfirmOpen(false);
    setDeleteCandidateId(null);
  };

  // Reset all state when modal closes
  const handleClose = () => {
    setEditingId(null);
    setEditName('');
    setMergeMode(false);
    setSelectedForMerge(new Set());
    setIsCreating(false);
    setNewSpeakerName('');
    onClose();
  };

  if (!isOpen) return null;

  const handleStartEdit = (profile: SpeakerUIProfile) => {
    setEditingId(profile.id);
    setEditName(profile.name);
  };

  const handleSaveEdit = () => {
    if (editingId && editName.trim()) {
      onRename(editingId, editName.trim());
    }
    setEditingId(null);
    setEditName('');
  };

  const toggleMergeSelection = (profileId: string) => {
    setSelectedForMerge((prev) => {
      const next = new Set(prev);
      if (next.has(profileId)) {
        next.delete(profileId);
      } else {
        next.add(profileId);
      }
      return next;
    });
  };

  const handleMerge = () => {
    const selected = Array.from(selectedForMerge);
    if (selected.length < 2) return;

    setIsProcessing(true);

    // Use setTimeout to allow UI to render loading state
    setTimeout(() => {
      // Merge all selected (except first) into the first one
      const targetId = selected[0];
      const sourceIds = selected.slice(1);

      onMerge(sourceIds, targetId);

      setSelectedForMerge(new Set());
      setMergeMode(false);
      setIsProcessing(false);
    }, 50);
  };

  const cancelMerge = () => {
    setSelectedForMerge(new Set());
    setMergeMode(false);
  };

  const handleCreateSpeaker = () => {
    if (onCreate && newSpeakerName.trim()) {
      onCreate(newSpeakerName.trim());
      setNewSpeakerName('');
      setIsCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-lg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-indigo-500/20 rounded-lg">
              <Users className="w-5 h-5 text-indigo-400" />
            </div>
            <h2 className="text-lg font-bold text-white">说话人档案</h2>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 max-h-[60vh] overflow-y-auto">
          {speakerProfiles.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <User className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>暂无说话人</p>
              <p className="text-xs mt-1">生成字幕后会自动添加</p>
            </div>
          ) : (
            <div className="space-y-2">
              {speakerProfiles.map((profile) => (
                <div
                  key={profile.id}
                  className={cn(
                    'flex items-center justify-between p-3 rounded-lg border transition-all',
                    selectedForMerge.has(profile.id)
                      ? 'bg-indigo-500/20 border-indigo-500'
                      : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
                  )}
                >
                  {editingId === profile.id ? (
                    <div className="flex-1 flex items-center gap-2">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveEdit();
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        autoFocus
                        className="flex-1 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm text-white focus:border-indigo-500 focus:outline-none"
                      />
                      <button
                        onClick={handleSaveEdit}
                        className="p-1.5 bg-indigo-600 hover:bg-indigo-500 rounded text-white transition-colors"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-3">
                        {mergeMode && (
                          <button
                            onClick={() => toggleMergeSelection(profile.id)}
                            className="text-slate-400 hover:text-white transition-colors"
                          >
                            {selectedForMerge.has(profile.id) ? (
                              <CheckSquare className="w-5 h-5 text-indigo-400" />
                            ) : (
                              <Square className="w-5 h-5" />
                            )}
                          </button>
                        )}
                        <span
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: getSpeakerColor(profile.name) }}
                        />
                        <span className="text-white font-medium">{profile.name}</span>
                        {speakerCounts && speakerCounts[profile.name] !== undefined && (
                          <span className="text-slate-500 text-xs">
                            ({speakerCounts[profile.name]})
                          </span>
                        )}
                      </div>
                      {!mergeMode && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleStartEdit(profile)}
                            className="p-1.5 text-slate-500 hover:text-white hover:bg-slate-700 rounded transition-colors"
                            title="重命名"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteClick(profile.id)}
                            className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-700 rounded transition-colors"
                            title="删除"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-slate-700">
          {isCreating ? (
            <div className="flex items-center gap-2 flex-1">
              <input
                type="text"
                value={newSpeakerName}
                onChange={(e) => setNewSpeakerName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateSpeaker();
                  if (e.key === 'Escape') setIsCreating(false);
                }}
                placeholder="输入说话人名称..."
                autoFocus
                className="flex-1 bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
              />
              <button
                onClick={handleCreateSpeaker}
                disabled={!newSpeakerName.trim()}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm rounded transition-colors"
              >
                添加
              </button>
              <button
                onClick={() => {
                  setIsCreating(false);
                  setNewSpeakerName('');
                }}
                className="px-3 py-1.5 text-sm text-slate-400 hover:text-white transition-colors"
              >
                取消
              </button>
            </div>
          ) : mergeMode ? (
            <>
              <span className="text-xs text-slate-400">
                已选择 {selectedForMerge.size} 个说话人
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={cancelMerge}
                  className="px-3 py-1.5 text-sm text-slate-400 hover:text-white transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleMerge}
                  disabled={selectedForMerge.size < 2 || isProcessing}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm rounded transition-colors flex items-center gap-2"
                >
                  {isProcessing && <Loader2 className="w-3 h-3 animate-spin" />}
                  {isProcessing ? '合并中...' : '合并'}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                {onCreate && (
                  <button
                    onClick={() => setIsCreating(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-400 hover:text-white transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    新建
                  </button>
                )}
                <button
                  onClick={() => setMergeMode(true)}
                  disabled={speakerProfiles.length < 2}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <GitMerge className="w-4 h-4" />
                  合并
                </button>
              </div>
              <button
                onClick={handleClose}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
              >
                完成
              </button>
            </>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <SimpleConfirmationModal
        isOpen={deleteConfirmOpen}
        onClose={() => {
          setDeleteConfirmOpen(false);
          setDeleteCandidateId(null);
        }}
        onConfirm={confirmDelete}
        title="删除说话人"
        message={`确定要删除说话人「${deleteCandidateName}」吗？该说话人的所有字幕将不再关联任何说话人。`}
        confirmText="删除"
        type="danger"
      />
    </div>
  );
};
