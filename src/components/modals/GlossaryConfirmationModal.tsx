import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Book, X, AlertCircle, CheckCircle, Sparkles, Edit2, Plus, Check } from 'lucide-react';
import { type GlossaryItem, type GlossaryExtractionResult, type AppSettings } from '@/types';
import { mergeGlossaryResults } from '@/services/glossary/merger';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { createGlossary } from '@/services/glossary/manager';
import { getActiveGlossaryTerms } from '@/services/glossary/utils';
import { cn } from '@/lib/cn';
import { Modal } from '@/components/ui/Modal';

interface GlossaryConfirmationModalProps {
  isOpen: boolean;
  pendingResults: GlossaryExtractionResult[];
  settings: AppSettings;
  onConfirm: (glossary: GlossaryItem[]) => void;
  onUpdateSetting: (key: keyof AppSettings, value: any) => void;
}

export const GlossaryConfirmationModal: React.FC<GlossaryConfirmationModalProps> = ({
  isOpen,
  pendingResults,
  settings,
  onConfirm,
  onUpdateSetting,
}) => {
  const { t } = useTranslation('modals');
  const [selectedTerms, setSelectedTerms] = useState<Set<string>>(new Set());
  const [resolvedConflicts, setResolvedConflicts] = useState<Record<string, GlossaryItem | null>>(
    {}
  );
  const [customTerms, setCustomTerms] = useState<GlossaryItem[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<GlossaryItem | null>(null);
  const [overrides, setOverrides] = useState<Record<string, GlossaryItem>>({});
  const [conflictCustomValues, setConflictCustomValues] = useState<Record<string, GlossaryItem>>(
    {}
  );
  const [showNewGlossaryDialog, setShowNewGlossaryDialog] = useState(false);
  const [newGlossaryName, setNewGlossaryName] = useState('');

  // Track if state has been initialized to prevent resets during editing
  const initialized = useRef(false);

  const [targetGlossaryId, setTargetGlossaryId] = useState<string | null>(
    settings.activeGlossaryId || null
  );

  const handleGlossaryChange = (val: string | null) => {
    if (val === 'create-new') {
      setShowNewGlossaryDialog(true);
      return;
    }
    setTargetGlossaryId(val);
    initialized.current = false;
  };

  const handleCreateNewGlossary = () => {
    if (!newGlossaryName.trim()) return;

    const newGlossary = createGlossary(newGlossaryName.trim(), settings.targetLanguage);
    const updatedGlossaries = [...(settings.glossaries || []), newGlossary];
    onUpdateSetting('glossaries', updatedGlossaries);

    setTargetGlossaryId(newGlossary.id);
    setShowNewGlossaryDialog(false);
    setNewGlossaryName('');
    initialized.current = false;
  };

  // Get target glossary terms (may differ from settings.activeGlossaryId)
  const targetGlossary =
    targetGlossaryId === 'temporary' || !targetGlossaryId
      ? null
      : settings.glossaries?.find((g) => g.id === targetGlossaryId);

  // Memoize active terms to prevent re-creating on every render
  const activeTerms = useMemo(() => {
    return targetGlossary?.terms || [];
  }, [targetGlossary]);

  // Memoize mergeGlossaryResults to prevent re-computing on every render
  const { unique, conflicts } = useMemo(
    () => mergeGlossaryResults(pendingResults, activeTerms),
    [pendingResults, activeTerms]
  );

  // Initialize state ONLY on first mount, not on every render
  useEffect(() => {
    if (!initialized.current && pendingResults.length > 0) {
      const newUnique = unique.filter(
        (u) => !activeTerms.some((g) => g.term.toLowerCase() === u.term.toLowerCase())
      );
      setSelectedTerms(new Set(newUnique.map((t) => t.term)));

      const initialResolved: Record<string, GlossaryItem | null> = {};
      conflicts.forEach((c) => {
        if (c.hasExisting) {
          const existing = c.options.find((o) =>
            activeTerms.some((g) => g.term === o.term && g.translation === o.translation)
          );
          if (existing) initialResolved[c.term] = existing;
        }
      });
      setResolvedConflicts(initialResolved);

      initialized.current = true; // Mark as initialized
    }
  }, [pendingResults, unique, conflicts, activeTerms]);

  if (!isOpen || pendingResults.length === 0) {
    return null;
  }

  const handleConfirm = () => {
    const termsToAdd = unique
      .filter((t) => selectedTerms.has(t.term))
      .map((t) => overrides[t.term] || t);
    const resolvedToAdd = Object.values(resolvedConflicts).filter(
      (t): t is GlossaryItem => t !== null
    );
    const newTerms = [...termsToAdd, ...resolvedToAdd, ...customTerms];

    if (targetGlossaryId === 'temporary') {
      onConfirm(newTerms);
    } else if (targetGlossaryId && settings.glossaries) {
      const updatedGlossaries = settings.glossaries.map((g) => {
        if (g.id === targetGlossaryId) {
          const uniqueMap = new Map<string, GlossaryItem>();
          (g.terms || []).forEach((item: GlossaryItem) =>
            uniqueMap.set(item.term.toLowerCase(), item)
          );
          newTerms.forEach((item) => uniqueMap.set(item.term.toLowerCase(), item));
          return { ...g, terms: Array.from(uniqueMap.values()) };
        }
        return g;
      });
      onUpdateSetting('glossaries', updatedGlossaries);
      onUpdateSetting('activeGlossaryId', targetGlossaryId);
      const updatedActive = updatedGlossaries.find((g) => g.id === targetGlossaryId);
      onConfirm(updatedActive?.terms || []);
    } else {
      const finalGlossary = [...getActiveGlossaryTerms(settings), ...newTerms];
      const uniqueMap = new Map<string, GlossaryItem>();
      finalGlossary.forEach((item) => uniqueMap.set(item.term.toLowerCase(), item));
      const deduplicated = Array.from(uniqueMap.values());

      // Note: This branch should ideally not be reached since we always have glossaries array now
      // But we keep it for backwards compatibility
      onConfirm(deduplicated);
    }

    // Reset state
    setCustomTerms([]);
    setResolvedConflicts({});
    setSelectedTerms(new Set());
    setOverrides({});
    setConflictCustomValues({});
  };

  const handleDiscard = () => {
    onConfirm(activeTerms);
    // Reset state
    setCustomTerms([]);
    setResolvedConflicts({});
    setSelectedTerms(new Set());
    setOverrides({});
    setConflictCustomValues({});
  };

  const toggleTerm = (term: string) => {
    const newSelected = new Set(selectedTerms);
    if (newSelected.has(term)) newSelected.delete(term);
    else newSelected.add(term);
    setSelectedTerms(newSelected);
  };

  const startEditing = (item: GlossaryItem, id: string) => {
    setEditingId(id);
    setEditValue({ ...item });

    // If editing a conflict's custom translation, clear any discard state
    if (id.startsWith('conflict-custom-')) {
      const term = id.replace('conflict-custom-', '');
      setResolvedConflicts((prev) => {
        const newConflicts = { ...prev };
        // Only clear if it was set to null (discard)
        if (newConflicts[term] === null) {
          delete newConflicts[term];
        }
        return newConflicts;
      });
    }
  };

  const saveEdit = (originalTerm: string) => {
    if (editValue) {
      if (editingId?.startsWith('custom-')) {
        setCustomTerms((prev) => prev.map((t) => (t.term === originalTerm ? editValue : t)));
      } else if (editingId?.startsWith('conflict-custom-')) {
        setConflictCustomValues((prev) => ({ ...prev, [originalTerm]: editValue }));
        setResolvedConflicts((prev) => ({ ...prev, [originalTerm]: editValue }));
      } else {
        setOverrides((prev) => ({ ...prev, [originalTerm]: editValue }));
      }
    }
    setEditingId(null);
    setEditValue(null);
  };

  const addCustomTerm = () => {
    const newTerm: GlossaryItem = { term: 'New Term', translation: '', notes: '' };
    setCustomTerms([...customTerms, newTerm]);
    setTimeout(() => startEditing(newTerm, `custom-${Date.now()}`), 0);
  };

  const totalToAdd =
    selectedTerms.size +
    Object.values(resolvedConflicts).filter((v) => v !== null).length +
    customTerms.length;

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={handleDiscard}
        maxWidth="4xl"
        title={undefined}
        showCloseButton={false}
        closeOnEscape={false}
        closeOnBackdropClick={false}
        contentClassName="p-0 flex flex-col h-full bg-white/50"
      >
        <div className="flex flex-col h-[85vh] max-h-[90vh]">
          {/* Header */}
          <div className="p-6 border-b border-slate-200/60 flex items-center justify-between bg-white/50 relative z-10 shrink-0">
            <div>
              <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2 tracking-tight">
                <div className="p-1.5 bg-brand-purple/10 rounded-lg">
                  <Book className="w-5 h-5 text-brand-purple" />
                </div>
                {t('glossaryConfirmation.title')}
              </h3>
              <p className="text-slate-500 text-sm mt-1 font-medium">
                {t('glossaryConfirmation.subtitle')}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={handleDiscard}
                className="text-slate-400 hover:text-slate-700 transition-colors p-1 hover:bg-slate-100 rounded-lg"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8 relative z-10">
            {/* Conflicts Section */}
            {conflicts.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-amber-600 uppercase tracking-wider flex items-center bg-amber-50 w-fit px-3 py-1 rounded-full border border-amber-200">
                  <AlertCircle className="w-4 h-4 mr-2" /> {t('glossaryConfirmation.conflicts')} (
                  {conflicts.length})
                </h3>
                <div className="grid gap-4">
                  {conflicts.map((conflict, idx) => {
                    const existingOption = conflict.options.find((o) =>
                      getActiveGlossaryTerms(settings)?.some(
                        (g) => g.term === o.term && g.translation === o.translation
                      )
                    );
                    const newOptions = conflict.options.filter((o) => o !== existingOption);
                    const customId = `conflict-custom-${conflict.term}`;
                    const isCustomEditing = editingId === customId;
                    const customValue = conflictCustomValues[conflict.term];
                    const isCustomSelected = resolvedConflicts[conflict.term] === customValue;

                    return (
                      <div
                        key={idx}
                        className="bg-amber-50/50 border border-amber-200/60 rounded-xl p-4 shadow-sm"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <span className="font-bold text-slate-800 text-lg">{conflict.term}</span>
                          <span className="text-xs text-amber-700 bg-amber-100 px-2 py-1 rounded-full border border-amber-200 font-medium">
                            {t('glossaryConfirmation.multipleVersions')}
                          </span>
                        </div>
                        <div className="space-y-2">
                          {/* N: New Options */}
                          {newOptions.map((option, optIdx) => (
                            <div
                              key={optIdx}
                              onClick={() => {
                                setResolvedConflicts((prev) => ({
                                  ...prev,
                                  [conflict.term]: option,
                                }));
                              }}
                              className={cn(
                                'p-3 rounded-lg border cursor-pointer transition-all shadow-sm',
                                resolvedConflicts[conflict.term] === option
                                  ? 'bg-brand-purple/5 border-brand-purple ring-1 ring-brand-purple/20'
                                  : 'bg-white border-slate-200 hover:border-brand-purple/30 hover:shadow-md'
                              )}
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <div className="font-medium text-slate-800 flex items-center gap-2">
                                    {option.translation}
                                  </div>
                                  {option.notes && (
                                    <div className="text-sm text-slate-500 mt-1">
                                      {option.notes}
                                    </div>
                                  )}
                                </div>
                                {resolvedConflicts[conflict.term] === option && (
                                  <CheckCircle className="w-5 h-5 text-brand-purple" />
                                )}
                              </div>
                            </div>
                          ))}

                          {/* +1: Keep Current (if exists) */}
                          {existingOption && (
                            <div
                              onClick={() => {
                                setResolvedConflicts((prev) => ({
                                  ...prev,
                                  [conflict.term]: existingOption,
                                }));
                              }}
                              className={cn(
                                'p-3 rounded-lg border cursor-pointer transition-all shadow-sm',
                                resolvedConflicts[conflict.term] === existingOption
                                  ? 'bg-brand-purple/5 border-brand-purple ring-1 ring-brand-purple/20'
                                  : 'bg-white border-slate-200 hover:border-brand-purple/30 hover:shadow-md'
                              )}
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <div className="font-medium text-slate-800 flex items-center gap-2">
                                    {existingOption.translation}
                                    <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200 font-medium">
                                      {t('glossaryConfirmation.keepCurrent')}
                                    </span>
                                  </div>
                                  {existingOption.notes && (
                                    <div className="text-sm text-slate-500 mt-1">
                                      {existingOption.notes}
                                    </div>
                                  )}
                                </div>
                                {resolvedConflicts[conflict.term] === existingOption && (
                                  <CheckCircle className="w-5 h-5 text-brand-purple" />
                                )}
                              </div>
                            </div>
                          )}

                          {/* +2: Custom Option */}
                          <div
                            className={cn(
                              'p-3 rounded-lg border cursor-pointer transition-all shadow-sm',
                              isCustomSelected
                                ? 'bg-brand-purple/5 border-brand-purple ring-1 ring-brand-purple/20'
                                : 'bg-white border-slate-200 hover:border-brand-purple/30 hover:shadow-md'
                            )}
                          >
                            {isCustomEditing ? (
                              <div className="space-y-2">
                                <input
                                  value={editValue?.translation || ''}
                                  onChange={(e) => {
                                    setEditValue((prev) =>
                                      prev ? { ...prev, translation: e.target.value } : null
                                    );
                                  }}
                                  className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1.5 text-sm text-slate-800 focus:outline-none focus:border-brand-purple focus:ring-1 focus:ring-brand-purple/20"
                                  placeholder={t('glossaryConfirmation.customTranslation')}
                                  autoFocus
                                  onClick={(e) => e.stopPropagation()}
                                />
                                <input
                                  value={editValue?.notes || ''}
                                  onChange={(e) => {
                                    setEditValue((prev) =>
                                      prev ? { ...prev, notes: e.target.value } : null
                                    );
                                  }}
                                  className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1.5 text-xs text-slate-600 focus:outline-none focus:border-brand-purple focus:ring-1 focus:ring-brand-purple/20"
                                  placeholder={t('glossaryConfirmation.notesOptional')}
                                  onClick={(e) => e.stopPropagation()}
                                />
                                <div className="flex justify-end gap-2">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingId(null);
                                    }}
                                    className="text-xs text-slate-500 hover:text-slate-800"
                                  >
                                    {t('glossaryConfirmation.cancel')}
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      saveEdit(conflict.term);
                                    }}
                                    className="text-xs text-brand-purple hover:text-brand-purple/80 font-medium"
                                  >
                                    {t('glossaryConfirmation.save')}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div
                                onClick={() => {
                                  if (customValue) {
                                    setResolvedConflicts((prev) => ({
                                      ...prev,
                                      [conflict.term]: customValue,
                                    }));
                                  } else {
                                    startEditing(
                                      { term: conflict.term, translation: '', notes: '' },
                                      customId
                                    );
                                  }
                                }}
                                className="flex items-center justify-between"
                              >
                                <div className="flex items-center gap-2">
                                  <div className="p-1 bg-emerald-50 rounded">
                                    <Edit2 className="w-4 h-4 text-emerald-600" />
                                  </div>
                                  <span
                                    className={
                                      customValue
                                        ? 'text-slate-800 font-medium'
                                        : 'text-slate-400 italic text-sm'
                                    }
                                  >
                                    {customValue
                                      ? customValue.translation
                                      : t('glossaryConfirmation.customTranslationPlaceholder')}
                                  </span>
                                </div>
                                {customValue && (
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        startEditing(customValue, customId);
                                      }}
                                      className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-800"
                                    >
                                      <Edit2 className="w-3 h-3" />
                                    </button>
                                    {isCustomSelected && (
                                      <CheckCircle className="w-5 h-5 text-brand-purple" />
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          {/* +3: Discard (if no existing option, or always show) */}
                          {!existingOption && (
                            <div
                              onClick={() => {
                                setResolvedConflicts((prev) => ({
                                  ...prev,
                                  [conflict.term]: null,
                                }));
                              }}
                              className={cn(
                                'p-3 rounded-lg border cursor-pointer transition-all shadow-sm',
                                resolvedConflicts[conflict.term] === null
                                  ? 'bg-red-50 border-red-200 text-red-600 ring-1 ring-red-100'
                                  : 'bg-slate-50 border-slate-200 hover:border-slate-300 text-slate-500'
                              )}
                            >
                              <div className="flex items-center gap-2">
                                <X className="w-4 h-4" />
                                <span className="font-medium">
                                  {t('glossaryConfirmation.doNotUse')}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* New Terms Section */}
            {unique.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-brand-purple uppercase tracking-wider flex items-center bg-brand-purple/10 px-3 py-1 rounded-full border border-brand-purple/20 w-fit">
                    <Sparkles className="w-4 h-4 mr-2" /> {t('glossaryConfirmation.newTerms')} (
                    {unique.length})
                  </h3>
                  <button
                    onClick={() => {
                      if (selectedTerms.size === unique.length) setSelectedTerms(new Set());
                      else setSelectedTerms(new Set(unique.map((t) => t.term)));
                    }}
                    className="text-xs text-brand-purple hover:text-brand-purple/80 font-medium bg-brand-purple/5 hover:bg-brand-purple/10 px-2 py-1 rounded-lg transition-colors"
                  >
                    {selectedTerms.size === unique.length
                      ? t('glossaryConfirmation.deselectAll')
                      : t('glossaryConfirmation.selectAll')}
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {unique.map((term, idx) => {
                    const isSelected = selectedTerms.has(term.term);
                    const isEditing = editingId === term.term;
                    const displayTerm = overrides[term.term] || term;

                    return (
                      <div
                        key={idx}
                        className={cn(
                          'p-3 rounded-xl border transition-all shadow-sm',
                          isSelected
                            ? 'bg-brand-purple/5 border-brand-purple/30 ring-1 ring-brand-purple/10'
                            : 'bg-white border-slate-200 opacity-80 hover:opacity-100 hover:shadow-md'
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <div className="pt-1">
                            <div
                              onClick={() => toggleTerm(term.term)}
                              className={cn(
                                'w-5 h-5 rounded border flex items-center justify-center cursor-pointer transition-colors',
                                isSelected
                                  ? 'bg-brand-purple border-brand-purple shadow-sm'
                                  : 'border-slate-300 bg-white hover:border-brand-purple'
                              )}
                            >
                              {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            {isEditing ? (
                              <div className="space-y-2">
                                <input
                                  value={editValue?.term}
                                  onChange={(e) => {
                                    setEditValue((prev) =>
                                      prev ? { ...prev, term: e.target.value } : null
                                    );
                                  }}
                                  className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-sm text-slate-800 focus:outline-none focus:border-brand-purple focus:ring-1 focus:ring-brand-purple/20"
                                  placeholder={t('glossaryConfirmation.termPlaceholder')}
                                />
                                <input
                                  value={editValue?.translation}
                                  onChange={(e) => {
                                    setEditValue((prev) =>
                                      prev ? { ...prev, translation: e.target.value } : null
                                    );
                                  }}
                                  className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-sm text-slate-800 focus:outline-none focus:border-brand-purple focus:ring-1 focus:ring-brand-purple/20"
                                  placeholder={t('glossaryConfirmation.translationPlaceholder')}
                                />
                                <input
                                  value={editValue?.notes}
                                  onChange={(e) => {
                                    setEditValue((prev) =>
                                      prev ? { ...prev, notes: e.target.value } : null
                                    );
                                  }}
                                  className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs text-slate-600 focus:outline-none focus:border-brand-purple focus:ring-1 focus:ring-brand-purple/20"
                                  placeholder={t('glossaryConfirmation.notesPlaceholder')}
                                />
                                <div className="flex justify-end gap-2">
                                  <button
                                    onClick={() => setEditingId(null)}
                                    className="text-xs text-slate-500 hover:text-slate-800"
                                  >
                                    {t('glossaryConfirmation.cancel')}
                                  </button>
                                  <button
                                    onClick={() => saveEdit(term.term)}
                                    className="text-xs text-brand-purple hover:text-brand-purple/80 font-medium"
                                  >
                                    {t('glossaryConfirmation.save')}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="group relative">
                                <div className="flex items-center justify-between">
                                  <div className="font-medium text-slate-800 text-base truncate pr-2">
                                    {displayTerm.term}
                                  </div>
                                  <button
                                    onClick={() => startEditing(displayTerm, term.term)}
                                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-brand-purple transition-all"
                                  >
                                    <Edit2 className="w-3 h-3" />
                                  </button>
                                </div>
                                <div className="text-brand-purple font-medium text-sm mt-0.5">
                                  {displayTerm.translation}
                                </div>
                                {displayTerm.notes && (
                                  <div className="text-slate-500 text-xs mt-1 italic">
                                    {displayTerm.notes}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Custom Terms Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-emerald-600 uppercase tracking-wider flex items-center bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200 w-fit">
                  <Plus className="w-4 h-4 mr-2" /> {t('glossaryConfirmation.customTerms')} (
                  {customTerms.length})
                </h3>
                <button
                  onClick={addCustomTerm}
                  className="text-xs bg-emerald-50 text-emerald-600 hover:bg-emerald-100 px-2 py-1 rounded-lg border border-emerald-200 transition-colors font-medium shadow-sm"
                >
                  {t('glossaryConfirmation.addTerm')}
                </button>
              </div>
              {customTerms.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {customTerms.map((term, idx) => {
                    const id = `custom-${idx}`;
                    const isEditing = editingId === id;

                    return (
                      <div
                        key={idx}
                        className="bg-white border border-emerald-200 rounded-xl p-3 shadow-sm"
                      >
                        {isEditing ? (
                          <div className="space-y-2">
                            <input
                              value={editValue?.term}
                              onChange={(e) => {
                                setEditValue((prev) =>
                                  prev ? { ...prev, term: e.target.value } : null
                                );
                              }}
                              className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-sm text-slate-800 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20"
                              placeholder={t('glossaryConfirmation.termPlaceholder')}
                            />
                            <input
                              value={editValue?.translation}
                              onChange={(e) => {
                                setEditValue((prev) =>
                                  prev ? { ...prev, translation: e.target.value } : null
                                );
                              }}
                              className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-sm text-slate-800 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20"
                              placeholder={t('glossaryConfirmation.translationPlaceholder')}
                            />
                            <input
                              value={editValue?.notes}
                              onChange={(e) => {
                                setEditValue((prev) =>
                                  prev ? { ...prev, notes: e.target.value } : null
                                );
                              }}
                              className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs text-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20"
                              placeholder={t('glossaryConfirmation.notesPlaceholder')}
                            />
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() => {
                                  setCustomTerms((prev) => prev.filter((_, i) => i !== idx));
                                  setEditingId(null);
                                }}
                                className="text-xs text-red-500 hover:text-red-700 font-medium"
                              >
                                {t('glossaryConfirmation.delete')}
                              </button>
                              <button
                                onClick={() => saveEdit(term.term)}
                                className="text-xs text-emerald-600 hover:text-emerald-700 font-medium"
                              >
                                {t('glossaryConfirmation.save')}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="group relative">
                            <div className="flex items-center justify-between">
                              <div className="font-medium text-slate-800 text-base truncate pr-2">
                                {term.term}
                              </div>
                              <button
                                onClick={() => startEditing(term, id)}
                                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-800 transition-all"
                              >
                                <Edit2 className="w-3 h-3" />
                              </button>
                            </div>
                            <div className="text-emerald-600 font-medium text-sm mt-0.5">
                              {term.translation}
                            </div>
                            {term.notes && (
                              <div className="text-slate-500 text-xs mt-1 italic">{term.notes}</div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="p-6 border-t border-slate-200/60 bg-slate-50/50 backdrop-blur-sm flex justify-between items-center relative z-20">
            <div className="flex items-center space-x-2">
              <button
                onClick={handleDiscard}
                className="px-4 py-2 text-slate-500 hover:text-slate-800 hover:bg-slate-200/50 rounded-lg transition-colors font-medium"
              >
                {t('glossaryConfirmation.discardAll')}
              </button>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <span className="text-sm text-slate-500 font-medium">
                  {t('glossaryConfirmation.addTo')}
                </span>
                <CustomSelect
                  value={targetGlossaryId || ''}
                  onChange={handleGlossaryChange}
                  options={[
                    ...(settings.glossaries?.map((g) => ({ value: g.id, label: g.name })) || []),
                    { value: 'temporary', label: t('glossaryConfirmation.temporarySession') },
                    { value: 'create-new', label: t('glossaryConfirmation.createNew') },
                  ]}
                  className="w-48"
                  placeholder={t('glossaryConfirmation.selectGlossary')}
                />
              </div>
              <button
                onClick={handleConfirm}
                disabled={!targetGlossaryId}
                className="bg-linear-to-r from-brand-purple to-brand-purple/90 hover:brightness-110 text-white px-6 py-2 rounded-lg font-medium shadow-lg shadow-brand-purple/25 transition-all flex items-center disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                {t('glossaryConfirmation.addTerms', { count: totalToAdd })}
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {/* New Glossary Dialog */}
      {showNewGlossaryDialog && (
        <div
          className="fixed inset-0 z-70 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
          onClick={() => {
            setShowNewGlossaryDialog(false);
            setNewGlossaryName('');
          }}
        >
          <div
            className="bg-white border border-slate-200 rounded-xl p-6 w-full max-w-md shadow-2xl ring-1 ring-black/5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Plus className="w-5 h-5 text-brand-purple" />
              {t('glossaryConfirmation.newGlossaryDialog.title')}
            </h3>
            <input
              type="text"
              value={newGlossaryName}
              onChange={(e) => setNewGlossaryName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateNewGlossary()}
              placeholder={t('glossaryConfirmation.newGlossaryDialog.placeholder')}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-slate-900 focus:outline-none focus:border-brand-purple focus:ring-1 focus:ring-brand-purple/20 mb-4 shadow-sm"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowNewGlossaryDialog(false);
                  setNewGlossaryName('');
                }}
                className="px-4 py-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors font-medium"
              >
                {t('glossaryConfirmation.newGlossaryDialog.cancel')}
              </button>
              <button
                onClick={handleCreateNewGlossary}
                disabled={!newGlossaryName.trim()}
                className="px-4 py-2 bg-brand-purple hover:bg-brand-purple/90 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-md shadow-brand-purple/20"
              >
                {t('glossaryConfirmation.newGlossaryDialog.create')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
