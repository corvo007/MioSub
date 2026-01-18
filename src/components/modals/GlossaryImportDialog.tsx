import React, { useState, useEffect } from 'react';
import { FileText, Plus, Merge, X, CheckCircle } from 'lucide-react';
import { useTranslation, Trans } from 'react-i18next';
import { type Glossary } from '@/types/glossary';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { cn } from '@/lib/cn';

export type ImportMode = 'create' | 'merge';
export type ConflictMode = 'skip' | 'overwrite';

interface GlossaryImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (
    mode: ImportMode,
    targetId: string | null,
    conflictMode: ConflictMode,
    newName: string | null
  ) => void;
  glossaries: Glossary[];
  importCount: number;
  defaultName: string;
}

export const GlossaryImportDialog: React.FC<GlossaryImportDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  glossaries,
  importCount,
  defaultName,
}) => {
  const { t } = useTranslation('modals');
  const [mode, setMode] = useState<ImportMode>('create');
  const [newName, setNewName] = useState(defaultName);
  const [targetId, setTargetId] = useState<string>(glossaries.length > 0 ? glossaries[0].id : '');
  const [conflictMode, setConflictMode] = useState<ConflictMode>('skip');

  useEffect(() => {
    if (isOpen) {
      setNewName(defaultName);
      if (glossaries.length > 0) {
        setTargetId(glossaries[0].id);
      }
      setMode('create');
      setConflictMode('skip');
    }
  }, [isOpen, defaultName, glossaries]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (mode === 'create' && !newName.trim()) return;
    if (mode === 'merge' && !targetId) return;

    onConfirm(
      mode,
      mode === 'merge' ? targetId : null,
      conflictMode,
      mode === 'create' ? newName : null
    );
  };

  return (
    <div className="fixed inset-0 z-70 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white/95 backdrop-blur-xl border border-white/60 rounded-2xl w-full max-w-lg shadow-2xl shadow-brand-purple/20 overflow-hidden ring-1 ring-slate-900/5 relative">
        <div className="absolute inset-0 bg-warm-mesh opacity-30 pointer-events-none" />

        <div className="p-6 border-b border-slate-200/60 flex items-center justify-between bg-white/50 relative z-10">
          <h3 className="text-xl font-bold text-slate-800 flex items-center tracking-tight gap-2">
            <div className="p-1.5 bg-brand-purple/10 rounded-lg">
              <FileText className="w-5 h-5 text-brand-purple" />
            </div>
            {t('glossaryImport.title')}
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 transition-colors p-1 hover:bg-slate-100 rounded-lg"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-6 relative z-10">
          <div className="bg-brand-purple/5 border border-brand-purple/20 rounded-lg p-4 flex items-start space-x-3">
            <div className="p-2 bg-brand-purple/20 rounded-full">
              <CheckCircle className="w-5 h-5 text-brand-purple" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-brand-purple">{t('glossaryImport.ready')}</h4>
              <p className="text-sm text-slate-600 mt-1">
                <Trans
                  i18nKey="modals:glossaryImport.readCount"
                  count={importCount}
                  components={{ 1: <span className="text-slate-900 font-bold" /> }}
                />
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <label className="text-sm font-medium text-slate-700">
              {t('glossaryImport.selectMode')}
            </label>

            <div className="grid grid-cols-1 gap-3">
              {/* Option 1: Create New */}
              <div
                onClick={() => setMode('create')}
                className={cn(
                  'p-4 rounded-xl border cursor-pointer transition-all shadow-sm',
                  mode === 'create'
                    ? 'bg-brand-purple/5 border-brand-purple ring-1 ring-brand-purple/20'
                    : 'bg-white border-slate-200 hover:border-brand-purple/30 hover:shadow-md'
                )}
              >
                <div className="flex items-center space-x-3">
                  <div
                    className={cn(
                      'w-5 h-5 rounded-full border flex items-center justify-center transition-colors',
                      mode === 'create' ? 'border-brand-purple' : 'border-slate-300'
                    )}
                  >
                    {mode === 'create' && (
                      <div className="w-2.5 h-2.5 rounded-full bg-brand-purple" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-slate-800 flex items-center">
                      <Plus className="w-4 h-4 mr-2 text-slate-500" /> {t('glossaryImport.create')}
                    </div>
                  </div>
                </div>

                {mode === 'create' && (
                  <div className="mt-4 pl-8 animate-fade-in">
                    <label className="block text-xs text-slate-500 mb-1 font-medium">
                      {t('glossaryImport.nameLabel')}
                    </label>
                    <input
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-brand-purple focus:ring-1 focus:ring-brand-purple/20 transition-all shadow-inner"
                      placeholder={t('glossaryImport.namePlaceholder')}
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                )}
              </div>

              {/* Option 2: Merge */}
              <div
                onClick={() => setMode('merge')}
                className={cn(
                  'p-4 rounded-xl border cursor-pointer transition-all shadow-sm',
                  mode === 'merge'
                    ? 'bg-brand-purple/5 border-brand-purple ring-1 ring-brand-purple/20'
                    : 'bg-white border-slate-200 hover:border-brand-purple/30 hover:shadow-md'
                )}
              >
                <div className="flex items-center space-x-3">
                  <div
                    className={cn(
                      'w-5 h-5 rounded-full border flex items-center justify-center transition-colors',
                      mode === 'merge' ? 'border-brand-purple' : 'border-slate-300'
                    )}
                  >
                    {mode === 'merge' && (
                      <div className="w-2.5 h-2.5 rounded-full bg-brand-purple" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-slate-800 flex items-center">
                      <Merge className="w-4 h-4 mr-2 text-slate-500" /> {t('glossaryImport.merge')}
                    </div>
                  </div>
                </div>

                {mode === 'merge' && (
                  <div className="mt-4 pl-8 space-y-4 animate-fade-in">
                    <div onClick={(e) => e.stopPropagation()}>
                      <label className="block text-xs text-slate-500 mb-1 font-medium">
                        {t('glossaryImport.targetLabel')}
                      </label>
                      <CustomSelect
                        value={targetId}
                        onChange={(val) => setTargetId(val)}
                        options={glossaries.map((g) => ({ value: g.id, label: g.name }))}
                        className="w-full"
                        placeholder={t('glossaryImport.selectPlaceholder')}
                      />
                    </div>

                    <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                      <label className="block text-xs text-slate-500 mb-2 font-medium">
                        {t('glossaryImport.conflictLabel')}
                      </label>
                      <div className="flex space-x-4">
                        <label className="flex items-center space-x-2 cursor-pointer hover:opacity-80 transition-opacity">
                          <div
                            className={cn(
                              'w-4 h-4 rounded-full border flex items-center justify-center transition-all',
                              conflictMode === 'skip' ? 'border-brand-purple' : 'border-slate-400'
                            )}
                          >
                            {conflictMode === 'skip' && (
                              <div className="w-2 h-2 rounded-full bg-brand-purple" />
                            )}
                          </div>
                          <span className="text-sm text-slate-700">{t('glossaryImport.skip')}</span>
                        </label>
                        <label className="flex items-center space-x-2 cursor-pointer hover:opacity-80 transition-opacity">
                          <div
                            className={cn(
                              'w-4 h-4 rounded-full border flex items-center justify-center transition-all',
                              conflictMode === 'overwrite'
                                ? 'border-brand-purple'
                                : 'border-slate-400'
                            )}
                          >
                            {conflictMode === 'overwrite' && (
                              <div className="w-2 h-2 rounded-full bg-brand-purple" />
                            )}
                          </div>
                          <span className="text-sm text-slate-700">
                            {t('glossaryImport.overwrite')}
                          </span>
                        </label>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-slate-200/60 bg-slate-50/50 backdrop-blur-sm flex justify-end space-x-3 relative z-20">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-500 hover:text-slate-800 hover:bg-slate-200/50 rounded-lg transition-colors font-medium"
          >
            {t('glossaryImport.cancel')}
          </button>
          <button
            onClick={handleConfirm}
            disabled={(mode === 'create' && !newName.trim()) || (mode === 'merge' && !targetId)}
            className="bg-linear-to-r from-brand-purple to-brand-purple/90 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2 rounded-lg font-medium shadow-lg shadow-brand-purple/25 transition-all flex items-center"
          >
            <CheckCircle className="w-4 h-4 mr-2" />
            {t('glossaryImport.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
};
