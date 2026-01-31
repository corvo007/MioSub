import React from 'react';
import {
  X,
  Users,
  Pencil,
  Trash2,
  Merge,
  Check,
  User,
  Plus,
  Square,
  CheckSquare,
  Loader2,
  Palette,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { type SpeakerUIProfile } from '@/types/speaker';
import { getSpeakerColor, getSpeakerColorWithCustom } from '@/services/utils/colors';
import { SimpleConfirmationModal } from '@/components/modals/SimpleConfirmationModal';
import { ColorPicker } from '@/components/ui/ColorPicker';
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
  onUpdateColor: (id: string, color: string) => void;
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
  onUpdateColor,
}) => {
  const { t } = useTranslation('modals');
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editName, setEditName] = React.useState('');
  const [mergeMode, setMergeMode] = React.useState(false);
  const [selectedForMerge, setSelectedForMerge] = React.useState<Set<string>>(new Set());
  const [isCreating, setIsCreating] = React.useState(false);
  const [newSpeakerName, setNewSpeakerName] = React.useState('');
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [editingColorId, setEditingColorId] = React.useState<string | null>(null);
  const [editColor, setEditColor] = React.useState('');

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
    setEditingColorId(null);
    setEditColor('');
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
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white/95 backdrop-blur-xl border border-white/60 rounded-2xl w-full max-w-lg shadow-2xl shadow-brand-purple/20 overflow-hidden relative ring-1 ring-slate-900/5">
        <div className="absolute inset-0 bg-warm-mesh opacity-30 pointer-events-none" />
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200/60 relative z-10">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-brand-purple/10 rounded-lg border border-brand-purple/10 shadow-sm">
              <Users className="w-5 h-5 text-brand-purple" />
            </div>
            <h2 className="text-lg font-bold text-slate-800">{t('speakerManager.title')}</h2>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-400 hover:text-slate-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 max-h-[60vh] overflow-y-auto relative z-10">
          {speakerProfiles.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <User className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>{t('speakerManager.noSpeakers')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {speakerProfiles.map((profile) => (
                <div
                  key={profile.id}
                  className={cn(
                    'flex items-center justify-between p-3 rounded-xl border transition-all shadow-sm',
                    selectedForMerge.has(profile.id)
                      ? 'bg-brand-purple/10 border-brand-purple/30 shadow-brand-purple/10'
                      : 'bg-white border-slate-200 hover:border-brand-purple/30 hover:shadow-md'
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
                        className="flex-1 bg-white border border-slate-300 rounded-lg px-2 py-1 text-sm text-slate-800 focus:border-brand-purple focus:outline-none focus:ring-1 focus:ring-brand-purple/20"
                      />
                      <button
                        onClick={handleSaveEdit}
                        className="p-1.5 bg-brand-purple hover:bg-brand-purple/90 rounded-lg text-white transition-colors shadow-sm shadow-brand-purple/20"
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
                              <CheckSquare className="w-5 h-5 text-brand-purple" />
                            ) : (
                              <Square className="w-5 h-5" />
                            )}
                          </button>
                        )}
                        <span
                          className="w-3 h-3 rounded-full shadow-sm ring-1 ring-black/5"
                          style={{
                            backgroundColor: getSpeakerColorWithCustom(profile.name, profile.color),
                          }}
                        />
                        <span className="text-slate-700 font-medium">{profile.name}</span>
                        {speakerCounts && speakerCounts[profile.name] !== undefined && (
                          <span className="text-slate-400 text-xs">
                            ({speakerCounts[profile.name]})
                          </span>
                        )}
                      </div>
                      {!mergeMode && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleStartEdit(profile)}
                            className="p-1.5 text-slate-400 hover:text-brand-purple hover:bg-slate-100 rounded-lg transition-colors border border-transparent hover:border-slate-200"
                            title={t('speakerManager.rename')}
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              setEditingColorId(profile.id);
                              setEditColor(profile.color || getSpeakerColor(profile.name));
                            }}
                            className="p-1.5 text-slate-400 hover:text-brand-purple hover:bg-slate-100 rounded-lg transition-colors border border-transparent hover:border-slate-200"
                            title={t('speakerManager.editColor')}
                          >
                            <Palette className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteClick(profile.id)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100"
                            title={t('speakerManager.delete')}
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
        <div className="flex items-center justify-between p-4 border-t border-slate-200/60 relative z-10 bg-slate-50/50">
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
                placeholder={t('speakerManager.inputPlaceholder')}
                autoFocus
                className="flex-1 bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-sm text-slate-800 placeholder-slate-400 focus:border-brand-purple focus:outline-none focus:ring-1 focus:ring-brand-purple/20"
              />
              <button
                onClick={handleCreateSpeaker}
                disabled={!newSpeakerName.trim()}
                className="px-3 py-1.5 bg-brand-purple hover:bg-brand-purple/90 disabled:opacity-50 text-white text-sm rounded-lg transition-colors shadow-sm shadow-brand-purple/20"
              >
                {t('speakerManager.add')}
              </button>
              <button
                onClick={() => {
                  setIsCreating(false);
                  setNewSpeakerName('');
                }}
                className="px-3 py-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors"
              >
                {t('speakerManager.cancel')}
              </button>
            </div>
          ) : mergeMode ? (
            <>
              <span className="text-xs text-slate-400">
                {t('speakerManager.mergeSelected', { count: selectedForMerge.size })}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={cancelMerge}
                  className="px-3 py-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors"
                >
                  {t('speakerManager.cancel')}
                </button>
                <button
                  onClick={handleMerge}
                  disabled={selectedForMerge.size < 2 || isProcessing}
                  className="px-3 py-1.5 bg-brand-purple hover:bg-brand-purple/90 disabled:opacity-50 text-white text-sm rounded-lg transition-colors flex items-center gap-2 shadow-sm shadow-brand-purple/20"
                >
                  {isProcessing && <Loader2 className="w-3 h-3 animate-spin" />}
                  {isProcessing ? t('speakerManager.merging') : t('speakerManager.merge')}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                {onCreate && (
                  <button
                    onClick={() => setIsCreating(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-500 hover:text-brand-purple hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    {t('speakerManager.create')}
                  </button>
                )}
                <button
                  onClick={() => setMergeMode(true)}
                  disabled={speakerProfiles.length < 2}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-500 hover:text-brand-purple hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                >
                  <Merge className="w-4 h-4" />
                  {t('speakerManager.merge')}
                </button>
              </div>
              <button
                onClick={handleClose}
                className="px-4 py-2 bg-brand-purple hover:bg-brand-purple/90 text-white text-sm font-medium rounded-lg transition-colors shadow-sm shadow-brand-purple/20"
              >
                {t('speakerManager.done')}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Color Picker Modal */}
      {editingColorId && (
        <div className="fixed inset-0 z-110 flex items-center justify-center bg-black/20 backdrop-blur-sm animate-fade-in">
          <div className="bg-white/95 backdrop-blur-xl border border-white/60 rounded-2xl p-4 w-80 shadow-2xl shadow-brand-purple/20 ring-1 ring-slate-900/5 relative overflow-hidden">
            <div className="absolute inset-0 bg-warm-mesh opacity-30 pointer-events-none" />
            <div className="relative z-10">
              <h3 className="text-slate-800 font-bold mb-3">{t('speakerManager.colorPicker')}</h3>
              <ColorPicker color={editColor} onChange={setEditColor} className="w-full" />
              <div className="flex items-center gap-2 mt-4">
                <button
                  onClick={() => {
                    onUpdateColor(editingColorId, editColor);
                    setEditingColorId(null);
                  }}
                  className="flex-1 px-4 py-2 bg-brand-purple hover:bg-brand-purple/90 text-white text-sm font-medium rounded-lg transition-colors shadow-md shadow-brand-purple/20"
                >
                  {t('speakerManager.done')}
                </button>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      const profile = speakerProfiles.find((p) => p.id === editingColorId);
                      if (profile) {
                        onUpdateColor(editingColorId, '');
                        setEditColor(getSpeakerColor(profile.name));
                      }
                    }}
                    className="px-3 py-2 text-sm text-slate-500 hover:text-brand-purple hover:bg-slate-100 rounded-lg transition-colors"
                    title={t('speakerManager.resetColor')}
                  >
                    {t('speakerManager.reset')}
                  </button>
                  <button
                    onClick={() => setEditingColorId(null)}
                    className="px-3 py-2 text-sm text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    {t('speakerManager.cancel')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <SimpleConfirmationModal
        isOpen={deleteConfirmOpen}
        onClose={() => {
          setDeleteConfirmOpen(false);
          setDeleteCandidateId(null);
        }}
        onConfirm={confirmDelete}
        title={t('speakerManager.deleteTitle')}
        message={t('speakerManager.deleteConfirm', { name: deleteCandidateName })}
        confirmText={t('speakerManager.deleteConfirmBtn')}
        type="danger"
      />
    </div>
  );
};
