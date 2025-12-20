import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Book, X, AlertCircle, CheckCircle, Sparkles, Edit2, Plus, Check } from 'lucide-react';
import { type GlossaryItem, type GlossaryExtractionResult, type AppSettings } from '@/types';
import { mergeGlossaryResults } from '@/services/glossary/merger';
import { CustomSelect } from '@/components/settings';
import { createGlossary } from '@/services/glossary/manager';
import { getActiveGlossaryTerms } from '@/services/glossary/utils';
import { cn } from '@/lib/cn';

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

    const newGlossary = createGlossary(newGlossaryName.trim());
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-slate-900 border border-indigo-500/30 rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
          <div>
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <Book className="w-5 h-5 text-indigo-400" />
              确认术语表
            </h3>
            <p className="text-slate-400 text-sm mt-1">提取完成，请选择要应用的术语。</p>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={handleDiscard}
              className="text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">
          {/* Conflicts Section */}
          {conflicts.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-amber-400 uppercase tracking-wider flex items-center">
                <AlertCircle className="w-4 h-4 mr-2" /> 冲突 ({conflicts.length})
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
                      className="bg-slate-800/50 border border-amber-500/20 rounded-xl p-4"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className="font-bold text-white text-lg">{conflict.term}</span>
                        <span className="text-xs text-amber-500 bg-amber-500/10 px-2 py-1 rounded-full border border-amber-500/20">
                          存在多个版本
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
                              'p-3 rounded-lg border cursor-pointer transition-all',
                              resolvedConflicts[conflict.term] === option
                                ? 'bg-indigo-500/20 border-indigo-500 ring-1 ring-indigo-500'
                                : 'bg-slate-800 border-slate-700 hover:border-slate-600'
                            )}
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="font-medium text-white flex items-center gap-2">
                                  {option.translation}
                                </div>
                                {option.notes && (
                                  <div className="text-sm text-slate-400 mt-1">{option.notes}</div>
                                )}
                              </div>
                              {resolvedConflicts[conflict.term] === option && (
                                <CheckCircle className="w-5 h-5 text-indigo-400" />
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
                              'p-3 rounded-lg border cursor-pointer transition-all',
                              resolvedConflicts[conflict.term] === existingOption
                                ? 'bg-indigo-500/20 border-indigo-500 ring-1 ring-indigo-500'
                                : 'bg-slate-800 border-slate-700 hover:border-slate-600'
                            )}
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="font-medium text-white flex items-center gap-2">
                                  {existingOption.translation}
                                  <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded">
                                    保留当前
                                  </span>
                                </div>
                                {existingOption.notes && (
                                  <div className="text-sm text-slate-400 mt-1">
                                    {existingOption.notes}
                                  </div>
                                )}
                              </div>
                              {resolvedConflicts[conflict.term] === existingOption && (
                                <CheckCircle className="w-5 h-5 text-indigo-400" />
                              )}
                            </div>
                          </div>
                        )}

                        {/* +2: Custom Option */}
                        <div
                          className={cn(
                            'p-3 rounded-lg border cursor-pointer transition-all',
                            isCustomSelected
                              ? 'bg-indigo-500/20 border-indigo-500 ring-1 ring-indigo-500'
                              : 'bg-slate-800 border-slate-700 hover:border-slate-600'
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
                                className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm text-white"
                                placeholder="自定义翻译"
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
                                className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-slate-400"
                                placeholder="备注 (可选)"
                                onClick={(e) => e.stopPropagation()}
                              />
                              <div className="flex justify-end gap-2">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingId(null);
                                  }}
                                  className="text-xs text-slate-400 hover:text-white"
                                >
                                  取消
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    saveEdit(conflict.term);
                                  }}
                                  className="text-xs text-indigo-400 hover:text-indigo-300"
                                >
                                  保存
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
                                <Edit2 className="w-4 h-4 text-emerald-400" />
                                <span
                                  className={
                                    customValue
                                      ? 'text-white font-medium'
                                      : 'text-slate-400 italic text-sm'
                                  }
                                >
                                  {customValue ? customValue.translation : '自定义翻译...'}
                                </span>
                              </div>
                              {customValue && (
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      startEditing(customValue, customId);
                                    }}
                                    className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white"
                                  >
                                    <Edit2 className="w-3 h-3" />
                                  </button>
                                  {isCustomSelected && (
                                    <CheckCircle className="w-5 h-5 text-indigo-400" />
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
                              setResolvedConflicts((prev) => ({ ...prev, [conflict.term]: null }));
                            }}
                            className={cn(
                              'p-3 rounded-lg border cursor-pointer transition-all',
                              resolvedConflicts[conflict.term] === null
                                ? 'bg-red-500/10 border-red-500/50 text-red-400'
                                : 'bg-slate-800 border-slate-700 hover:border-slate-600 text-slate-400'
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <X className="w-4 h-4" />
                              <span>不使用此术语</span>
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
                <h3 className="text-sm font-bold text-indigo-400 uppercase tracking-wider flex items-center">
                  <Sparkles className="w-4 h-4 mr-2" /> 新术语 ({unique.length})
                </h3>
                <button
                  onClick={() => {
                    if (selectedTerms.size === unique.length) setSelectedTerms(new Set());
                    else setSelectedTerms(new Set(unique.map((t) => t.term)));
                  }}
                  className="text-xs text-indigo-400 hover:text-indigo-300"
                >
                  {selectedTerms.size === unique.length ? '取消全选' : '全选'}
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
                        'p-3 rounded-xl border transition-all',
                        isSelected
                          ? 'bg-indigo-500/10 border-indigo-500/30'
                          : 'bg-slate-800/50 border-slate-700 opacity-60'
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className="pt-1">
                          <div
                            onClick={() => toggleTerm(term.term)}
                            className={cn(
                              'w-5 h-5 rounded border flex items-center justify-center cursor-pointer transition-colors',
                              isSelected
                                ? 'bg-indigo-500 border-indigo-500'
                                : 'border-slate-600 bg-slate-700/50 hover:border-slate-500'
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
                                className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm text-white"
                                placeholder="术语"
                              />
                              <input
                                value={editValue?.translation}
                                onChange={(e) => {
                                  setEditValue((prev) =>
                                    prev ? { ...prev, translation: e.target.value } : null
                                  );
                                }}
                                className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm text-white"
                                placeholder="翻译"
                              />
                              <input
                                value={editValue?.notes}
                                onChange={(e) => {
                                  setEditValue((prev) =>
                                    prev ? { ...prev, notes: e.target.value } : null
                                  );
                                }}
                                className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-slate-400"
                                placeholder="备注"
                              />
                              <div className="flex justify-end gap-2">
                                <button
                                  onClick={() => setEditingId(null)}
                                  className="text-xs text-slate-400 hover:text-white"
                                >
                                  取消
                                </button>
                                <button
                                  onClick={() => saveEdit(term.term)}
                                  className="text-xs text-indigo-400 hover:text-indigo-300"
                                >
                                  保存
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="group relative">
                              <div className="flex items-center justify-between">
                                <div className="font-medium text-white text-base truncate pr-2">
                                  {displayTerm.term}
                                </div>
                                <button
                                  onClick={() => startEditing(displayTerm, term.term)}
                                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-all"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                              </div>
                              <div className="text-indigo-300 text-sm mt-0.5">
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
              <h3 className="text-sm font-bold text-emerald-400 uppercase tracking-wider flex items-center">
                <Plus className="w-4 h-4 mr-2" /> 自定义术语 ({customTerms.length})
              </h3>
              <button
                onClick={addCustomTerm}
                className="text-xs bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 px-2 py-1 rounded border border-emerald-500/20 transition-colors"
              >
                + 添加术语
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
                      className="bg-slate-800/50 border border-emerald-500/20 rounded-xl p-3"
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
                            className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm text-white"
                            placeholder="术语"
                          />
                          <input
                            value={editValue?.translation}
                            onChange={(e) => {
                              setEditValue((prev) =>
                                prev ? { ...prev, translation: e.target.value } : null
                              );
                            }}
                            className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm text-white"
                            placeholder="翻译"
                          />
                          <input
                            value={editValue?.notes}
                            onChange={(e) => {
                              setEditValue((prev) =>
                                prev ? { ...prev, notes: e.target.value } : null
                              );
                            }}
                            className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-slate-400"
                            placeholder="备注"
                          />
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => {
                                setCustomTerms((prev) => prev.filter((_, i) => i !== idx));
                                setEditingId(null);
                              }}
                              className="text-xs text-red-400 hover:text-red-300"
                            >
                              删除
                            </button>
                            <button
                              onClick={() => saveEdit(term.term)}
                              className="text-xs text-emerald-400 hover:text-emerald-300"
                            >
                              保存
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="group relative">
                          <div className="flex items-center justify-between">
                            <div className="font-medium text-white text-base truncate pr-2">
                              {term.term}
                            </div>
                            <button
                              onClick={() => startEditing(term, id)}
                              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-all"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                          </div>
                          <div className="text-emerald-300 text-sm mt-0.5">{term.translation}</div>
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

        <div className="p-6 border-t border-slate-800 bg-slate-900/50 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <button
              onClick={handleDiscard}
              className="px-4 py-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
              全部丢弃
            </button>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <span className="text-sm text-slate-400">添加到:</span>
              <CustomSelect
                value={targetGlossaryId || ''}
                onChange={handleGlossaryChange}
                options={[
                  ...(settings.glossaries?.map((g) => ({ value: g.id, label: g.name })) || []),
                  { value: 'temporary', label: '临时 (仅本次会话)' },
                  { value: 'create-new', label: '+ 新建术语表' },
                ]}
                className="w-48"
                placeholder="选择术语表"
              />
            </div>
            <button
              onClick={handleConfirm}
              disabled={!targetGlossaryId}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-lg font-medium shadow-lg shadow-indigo-500/25 transition-all flex items-center disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-indigo-600"
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              添加 {totalToAdd} 个术语
            </button>
          </div>
        </div>
      </div>

      {/* New Glossary Dialog */}
      {showNewGlossaryDialog && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
          onClick={() => {
            setShowNewGlossaryDialog(false);
            setNewGlossaryName('');
          }}
        >
          <div
            className="bg-slate-900 border border-indigo-500/30 rounded-xl p-6 w-full max-w-md shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Plus className="w-5 h-5 text-indigo-400" />
              新建术语表
            </h3>
            <input
              type="text"
              value={newGlossaryName}
              onChange={(e) => setNewGlossaryName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateNewGlossary()}
              placeholder="输入术语表名称"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500 mb-4"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowNewGlossaryDialog(false);
                  setNewGlossaryName('');
                }}
                className="px-4 py-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleCreateNewGlossary}
                disabled={!newGlossaryName.trim()}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
