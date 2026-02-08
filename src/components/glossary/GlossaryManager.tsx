import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Book,
  Plus,
  Trash2,
  Edit2,
  Download,
  Upload,
  CheckCircle,
  X,
  Search,
  AlertCircle,
} from 'lucide-react';
import { type Glossary, type GlossaryItem } from '@/types/glossary';
import {
  createGlossary,
  renameGlossary,
  exportGlossary,
  importGlossary,
} from '@/services/glossary/manager';
import {
  GlossaryImportDialog,
  type ImportMode,
  type ConflictMode,
} from '@/components/modals/GlossaryImportDialog';
import { cn } from '@/lib/cn';
import { logger } from '@/services/utils/logger';
import { toLocalizedLanguageName } from '@/services/utils/language';
import { detectGlossaryLanguage } from '@/services/utils/language';
import { CustomSelect } from '@/components/ui/CustomSelect';

interface GlossaryManagerProps {
  glossaries: Glossary[];
  activeGlossaryId: string | null;
  targetLanguage?: string;
  onUpdateGlossaries: (glossaries: Glossary[]) => void;
  onSetActiveGlossary: (id: string) => void;
  onClose: () => void;
}

export const GlossaryManager: React.FC<GlossaryManagerProps> = ({
  glossaries,
  activeGlossaryId,
  targetLanguage,
  onUpdateGlossaries,
  onSetActiveGlossary,
  onClose,
}) => {
  const { t, i18n } = useTranslation('editor');

  const glossaryLanguageOptions = useMemo(() => {
    const codes = [
      'zh-CN',
      'zh-TW',
      'en',
      'ja',
      'ko',
      'es',
      'fr',
      'de',
      'ru',
      'pt',
      'it',
      'vi',
      'th',
      'id',
    ];
    return codes.map((code) => ({
      value: code,
      label: toLocalizedLanguageName(code, i18n.language),
    }));
  }, [i18n.language]);

  const [selectedGlossaryId, setSelectedGlossaryId] = useState<string | null>(activeGlossaryId);
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [newTermData, setNewTermData] = useState<{
    term: string;
    translation: string;
    notes: string;
  }>({ term: '', translation: '', notes: '' });

  // Term Editing State
  const [editingTermIndex, setEditingTermIndex] = useState<number | null>(null);
  const [editTermData, setEditTermData] = useState<GlossaryItem | null>(null);

  const termInputRef = useRef<HTMLInputElement>(null);

  // Import Dialog State
  const [importDialogData, setImportDialogData] = useState<{
    isOpen: boolean;
    items: GlossaryItem[];
    filename: string;
  }>({ isOpen: false, items: [], filename: '' });

  // Ensure we have a selection
  useEffect(() => {
    if (!selectedGlossaryId && glossaries.length > 0) {
      setSelectedGlossaryId(glossaries[0].id);
    }
  }, [glossaries, selectedGlossaryId]);

  const selectedGlossary = glossaries.find((g) => g.id === selectedGlossaryId);

  const filteredTerms = useMemo(() => {
    if (!selectedGlossary) return [];
    const lowerSearch = searchTerm.toLowerCase();
    return selectedGlossary.terms
      .map((item, index) => ({ item, originalIndex: index }))
      .filter(
        ({ item }) =>
          item.term.toLowerCase().includes(lowerSearch) ||
          item.translation.toLowerCase().includes(lowerSearch)
      );
  }, [selectedGlossary, searchTerm]);

  const handleAddGlossary = () => {
    const newGlossary = createGlossary(
      t('glossary.newGlossaryName', { num: glossaries.length + 1 }),
      targetLanguage
    );
    onUpdateGlossaries([...glossaries, newGlossary]);
    setSelectedGlossaryId(newGlossary.id);
    // Auto-start editing name
    setEditingNameId(newGlossary.id);
    setEditNameValue(newGlossary.name);
  };

  const handleRename = (id: string) => {
    if (!editNameValue.trim()) return;
    const updated = glossaries.map((g) => (g.id === id ? renameGlossary(g, editNameValue) : g));
    onUpdateGlossaries(updated);
    setEditingNameId(null);
  };

  const handleDelete = (id: string) => {
    const updated = glossaries.filter((g) => g.id !== id);
    onUpdateGlossaries(updated);
    setShowDeleteConfirm(null);
    if (selectedGlossaryId === id) {
      setSelectedGlossaryId(updated.length > 0 ? updated[0].id : null);
    }
    if (activeGlossaryId === id) {
      onSetActiveGlossary(updated.length > 0 ? updated[0].id : ''); // Or handle no active glossary
    }
  };

  const handleUpdateTerms = (newItems: GlossaryItem[]) => {
    if (!selectedGlossaryId) return;
    const current = glossaries.find((g) => g.id === selectedGlossaryId);
    const wasEmpty = current && current.terms.length === 0;

    const updated = glossaries.map((g) => {
      if (g.id !== selectedGlossaryId) return g;
      const patch: Partial<Glossary> = { terms: newItems, updatedAt: new Date().toISOString() };
      // Auto-detect language when empty glossary gets first terms
      if (wasEmpty && newItems.length > 0 && !g.targetLanguage) {
        patch.targetLanguage = detectGlossaryLanguage({ ...g, terms: newItems });
      }
      return { ...g, ...patch };
    });
    onUpdateGlossaries(updated);
  };

  const handleLanguageChange = (lang: string) => {
    if (!selectedGlossaryId) return;
    const updated = glossaries.map((g) =>
      g.id === selectedGlossaryId
        ? { ...g, targetLanguage: lang, updatedAt: new Date().toISOString() }
        : g
    );
    onUpdateGlossaries(updated);
  };

  const handleSaveEdit = () => {
    if (!selectedGlossary || editingTermIndex === null || !editTermData) return;

    const newTerms = [...selectedGlossary.terms];
    newTerms[editingTermIndex] = editTermData;

    handleUpdateTerms(newTerms);
    setEditingTermIndex(null);
    setEditTermData(null);
  };

  const handleCancelEdit = () => {
    setEditingTermIndex(null);
    setEditTermData(null);
  };

  const handleExport = () => {
    if (!selectedGlossary) return;
    const json = exportGlossary(selectedGlossary);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedGlossary.name.replace(/\s+/g, '_')}_glossary.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const imported = importGlossary(content);
        // Instead of adding directly, open the dialog
        setImportDialogData({
          isOpen: true,
          items: imported.terms,
          filename: imported.name,
        });
      } catch (err) {
        logger.error('Import failed', err);
        // Could add toast here
      }
    };
    reader.readAsText(file);
    // Reset input
    e.target.value = '';
  };

  const handleConfirmImport = (
    mode: ImportMode,
    targetId: string | null,
    conflictMode: ConflictMode,
    newName: string | null
  ) => {
    const { items } = importDialogData;

    if (mode === 'create') {
      const name = newName || `Imported Glossary`;
      const newGlossary = createGlossary(name, targetLanguage);
      newGlossary.terms = items;
      onUpdateGlossaries([...glossaries, newGlossary]);
      setSelectedGlossaryId(newGlossary.id);
    } else if (mode === 'merge' && targetId) {
      const targetGlossary = glossaries.find((g) => g.id === targetId);
      if (targetGlossary) {
        let mergedTerms = [...targetGlossary.terms];
        const existingMap = new Map(targetGlossary.terms.map((t) => [t.term.toLowerCase(), t]));

        if (conflictMode === 'skip') {
          // Add only terms that don't exist
          const newUnique = items.filter((t) => !existingMap.has(t.term.toLowerCase()));
          mergedTerms = [...mergedTerms, ...newUnique];
        } else {
          // Overwrite: Add all new terms, replacing existing ones
          const newMap = new Map(items.map((t) => [t.term.toLowerCase(), t]));
          // Keep existing terms that are NOT in new items
          const keptExisting = targetGlossary.terms.filter(
            (t) => !newMap.has(t.term.toLowerCase())
          );
          mergedTerms = [...keptExisting, ...items];
        }

        const updated = glossaries.map((g) =>
          g.id === targetId ? { ...g, terms: mergedTerms, updatedAt: new Date().toISOString() } : g
        );
        onUpdateGlossaries(updated);
        setSelectedGlossaryId(targetId);
      }
    }

    setImportDialogData({ isOpen: false, items: [], filename: '' });
  };

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white/95 backdrop-blur-xl border border-white/60 rounded-2xl w-full max-w-5xl h-[85vh] flex shadow-2xl shadow-brand-purple/20 overflow-hidden relative ring-1 ring-slate-900/5">
        <div className="absolute inset-0 bg-warm-mesh opacity-30 pointer-events-none" />

        {/* Sidebar - Glossary List */}
        <div className="w-64 bg-slate-50/80 backdrop-blur-md border-r border-slate-200/60 flex flex-col relative z-20">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-800 flex items-center tracking-tight">
              <div className="p-1.5 bg-brand-purple/10 rounded-lg mr-2">
                <Book className="w-4 h-4 text-brand-purple" />
              </div>
              {t('glossary.title')}
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
            {glossaries.map((glossary) => (
              <div
                key={glossary.id}
                onClick={() => setSelectedGlossaryId(glossary.id)}
                className={cn(
                  'group relative flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all border',
                  selectedGlossaryId === glossary.id
                    ? 'bg-white border-brand-purple/20 shadow-sm ring-1 ring-brand-purple/5'
                    : 'hover:bg-white/60 border-transparent hover:border-slate-200/50 hover:shadow-sm'
                )}
              >
                {showDeleteConfirm === glossary.id ? (
                  <div className="absolute inset-0 bg-white/95 backdrop-blur-sm flex items-center justify-between px-3 rounded-lg z-10 border border-red-200">
                    <span className="text-xs text-red-600 font-medium flex items-center">
                      <AlertCircle className="w-3 h-3 mr-1" /> {t('glossary.deleteConfirm')}
                    </span>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(glossary.id);
                        }}
                        className="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-600 text-xs rounded border border-red-200 transition-colors font-medium"
                      >
                        {t('glossary.yes')}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowDeleteConfirm(null);
                        }}
                        className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs rounded border border-slate-200 transition-colors font-medium"
                      >
                        {t('glossary.no')}
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="flex-1 min-w-0">
                  {editingNameId === glossary.id ? (
                    <input
                      autoFocus
                      value={editNameValue}
                      onChange={(e) => setEditNameValue(e.target.value)}
                      onBlur={() => handleRename(glossary.id)}
                      onKeyDown={(e) => e.key === 'Enter' && handleRename(glossary.id)}
                      className="w-full bg-white border border-brand-purple rounded px-2 py-1 text-sm text-slate-900 focus:outline-none shadow-sm"
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <div className="flex items-center">
                      <span
                        className={cn(
                          'text-sm font-medium truncate transition-colors',
                          selectedGlossaryId === glossary.id
                            ? 'text-brand-purple'
                            : 'text-slate-700 group-hover:text-slate-900'
                        )}
                      >
                        {glossary.name}
                      </span>
                      {activeGlossaryId === glossary.id && (
                        <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200 shadow-sm">
                          {t('glossary.currentlyUsed')}
                        </span>
                      )}
                    </div>
                  )}
                  <div
                    className={cn(
                      'text-[10px] mt-0.5 transition-colors flex items-center gap-1.5',
                      selectedGlossaryId === glossary.id ? 'text-brand-purple/70' : 'text-slate-400'
                    )}
                  >
                    {t('glossary.termCount', { count: glossary.terms.length })}
                    {glossary.targetLanguage && (
                      <span className="px-1 py-px rounded bg-slate-100 text-slate-500 border border-slate-200 text-[9px] font-medium">
                        {toLocalizedLanguageName(glossary.targetLanguage, i18n.language)}
                      </span>
                    )}
                  </div>
                </div>

                <div
                  className={cn(
                    'flex items-center space-x-1 transition-opacity',
                    selectedGlossaryId === glossary.id
                      ? 'opacity-100'
                      : 'opacity-0 group-hover:opacity-100'
                  )}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingNameId(glossary.id);
                      setEditNameValue(glossary.name);
                    }}
                    className="p-1.5 hover:bg-slate-100 rounded text-slate-400 hover:text-brand-purple transition-colors"
                    title={t('glossary.rename')}
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowDeleteConfirm(glossary.id);
                    }}
                    className="p-1.5 hover:bg-red-50 rounded text-slate-400 hover:text-red-500 transition-colors"
                    title={t('glossary.delete')}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="p-4 border-t border-slate-200 space-y-2 bg-slate-50/50">
            <button
              onClick={handleAddGlossary}
              className="w-full flex items-center justify-center space-x-2 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 py-2 rounded-lg transition-all border border-slate-200 shadow-sm hover:shadow hover:border-slate-300 font-medium"
            >
              <Plus className="w-4 h-4 text-brand-purple" />
              <span className="text-sm">{t('glossary.createNew')}</span>
            </button>
            {glossaries.length === 0 && (
              <label className="w-full flex items-center justify-center space-x-2 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 py-2 rounded-lg transition-all border border-slate-200 cursor-pointer shadow-sm hover:shadow font-medium">
                <Upload className="w-4 h-4 text-brand-purple" />
                <span className="text-sm">{t('glossary.import')}</span>
                <input type="file" accept=".json" onChange={handleImport} className="hidden" />
              </label>
            )}
          </div>
        </div>

        {/* Main Content - Terms Editor */}
        <div className="flex-1 flex flex-col bg-slate-50/50 backdrop-blur-sm relative z-10">
          {selectedGlossary ? (
            <>
              <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-white/50 pr-12">
                <div>
                  <h2 className="text-xl font-bold text-slate-800 flex items-center tracking-tight">
                    {selectedGlossary.name}
                    {activeGlossaryId === selectedGlossary.id && (
                      <span className="ml-3 px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-700 border border-emerald-200 flex items-center shadow-sm">
                        <CheckCircle className="w-3 h-3 mr-1" /> {t('glossary.currentlyUsed')}
                      </span>
                    )}
                  </h2>
                  <p className="text-slate-500 text-sm mt-1 font-medium flex items-center gap-2">
                    <span>
                      {t('glossary.lastUpdated')}:{' '}
                      <span className="text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">
                        {new Date(selectedGlossary.updatedAt).toLocaleDateString()}
                      </span>
                    </span>
                    <CustomSelect
                      value={selectedGlossary.targetLanguage || ''}
                      onChange={handleLanguageChange}
                      options={glossaryLanguageOptions}
                      className="w-32 text-xs"
                    />
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  {activeGlossaryId !== selectedGlossary.id && (
                    <button
                      onClick={() => onSetActiveGlossary(selectedGlossary.id)}
                      className="px-3 py-1.5 bg-brand-purple hover:bg-brand-purple/90 text-white rounded-lg text-sm font-medium transition-all shadow-sm flex items-center"
                    >
                      <CheckCircle className="w-4 h-4 mr-2" /> {t('glossary.setAsCurrent')}
                    </button>
                  )}
                  <div className="h-6 w-px bg-slate-200 mx-2" />
                  <label
                    className="p-2 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-slate-500 hover:text-slate-700 transition-colors cursor-pointer shadow-sm"
                    title={t('glossary.importJson')}
                  >
                    <Download className="w-5 h-5" />
                    <input type="file" accept=".json" onChange={handleImport} className="hidden" />
                  </label>
                  <button
                    onClick={handleExport}
                    className="p-2 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-slate-500 hover:text-slate-700 transition-colors shadow-sm"
                    title={t('glossary.exportJson')}
                  >
                    <Upload className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="flex-1 flex flex-col min-h-0">
                {/* Search & Add */}
                <div className="p-4 border-b border-slate-200 flex space-x-4 bg-white/30">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder={t('glossary.searchTerms')}
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-800 focus:outline-none focus:border-brand-purple focus:ring-1 focus:ring-brand-purple/20 shadow-sm transition-all placeholder:text-slate-400"
                    />
                  </div>
                </div>

                {/* Terms Table */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
                  <div className="space-y-2">
                    {/* Add New Term Row */}
                    <div className="flex items-start space-x-2 p-3 bg-white border border-slate-200 rounded-xl shadow-sm">
                      <div className="flex-1 space-y-2">
                        <div className="flex space-x-2">
                          <input
                            ref={termInputRef}
                            placeholder={t('glossary.term')}
                            className="flex-1 bg-slate-50 border border-slate-200 rounded px-2 py-1.5 text-sm text-slate-800 focus:outline-none focus:border-brand-purple focus:ring-1 focus:ring-brand-purple/20 transition-all placeholder:text-slate-400"
                            value={newTermData.term}
                            onChange={(e) =>
                              setNewTermData({ ...newTermData, term: e.target.value })
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                if (newTermData.term && newTermData.translation) {
                                  handleUpdateTerms([...selectedGlossary.terms, newTermData]);
                                  setNewTermData({ term: '', translation: '', notes: '' });
                                  // Restore focus
                                  termInputRef.current?.focus();
                                }
                              }
                            }}
                          />
                          <input
                            placeholder={t('glossary.translation')}
                            className="flex-1 bg-slate-50 border border-slate-200 rounded px-2 py-1.5 text-sm text-slate-800 focus:outline-none focus:border-brand-purple focus:ring-1 focus:ring-brand-purple/20 transition-all placeholder:text-slate-400"
                            value={newTermData.translation}
                            onChange={(e) =>
                              setNewTermData({ ...newTermData, translation: e.target.value })
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                if (newTermData.term && newTermData.translation) {
                                  handleUpdateTerms([...selectedGlossary.terms, newTermData]);
                                  setNewTermData({ term: '', translation: '', notes: '' });
                                  termInputRef.current?.focus();
                                }
                              }
                            }}
                          />
                        </div>
                        <input
                          placeholder={t('glossary.notes')}
                          className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1.5 text-xs text-slate-600 focus:outline-none focus:border-brand-purple focus:ring-1 focus:ring-brand-purple/20 transition-all placeholder:text-slate-400"
                          value={newTermData.notes}
                          onChange={(e) =>
                            setNewTermData({ ...newTermData, notes: e.target.value })
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              if (newTermData.term && newTermData.translation) {
                                handleUpdateTerms([...selectedGlossary.terms, newTermData]);
                                setNewTermData({ term: '', translation: '', notes: '' });
                                termInputRef.current?.focus();
                              }
                            }
                          }}
                        />
                      </div>
                      <button
                        onClick={() => {
                          if (newTermData.term && newTermData.translation) {
                            handleUpdateTerms([...selectedGlossary.terms, newTermData]);
                            setNewTermData({ term: '', translation: '', notes: '' });
                            termInputRef.current?.focus();
                          }
                        }}
                        className="p-2 bg-brand-purple hover:bg-brand-purple/90 text-white rounded-lg transition-colors shadow-sm"
                      >
                        <Plus className="w-5 h-5" />
                      </button>
                    </div>

                    {/* Existing Terms */}
                    {filteredTerms.map(({ item, originalIndex }) => (
                      <div
                        key={originalIndex}
                        className={cn(
                          'flex items-start space-x-2 p-3 rounded-xl border transition-all',
                          editingTermIndex === originalIndex
                            ? 'bg-brand-purple/5 border-brand-purple ring-1 ring-brand-purple/20'
                            : 'bg-white border-transparent hover:border-slate-200 hover:shadow-sm group'
                        )}
                      >
                        {editingTermIndex === originalIndex && editTermData ? (
                          // EDIT MODE
                          <>
                            <div className="flex-1 space-y-2">
                              <div className="flex space-x-2">
                                <input
                                  value={editTermData.term}
                                  onChange={(e) =>
                                    setEditTermData({ ...editTermData, term: e.target.value })
                                  }
                                  className="flex-1 bg-white border border-brand-purple rounded px-2 py-1 text-sm text-slate-900 focus:outline-none shadow-sm"
                                  placeholder={t('glossary.term')}
                                  autoFocus
                                />
                                <input
                                  value={editTermData.translation}
                                  onChange={(e) =>
                                    setEditTermData({
                                      ...editTermData,
                                      translation: e.target.value,
                                    })
                                  }
                                  className="flex-1 bg-white border border-brand-purple rounded px-2 py-1 text-sm text-slate-900 focus:outline-none shadow-sm"
                                  placeholder={t('glossary.translation')}
                                />
                              </div>
                              <input
                                value={editTermData.notes || ''}
                                onChange={(e) =>
                                  setEditTermData({ ...editTermData, notes: e.target.value })
                                }
                                className="w-full bg-white border border-brand-purple rounded px-2 py-1 text-xs text-slate-600 focus:outline-none shadow-sm"
                                placeholder={t('glossary.notes')}
                                onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit()}
                              />
                            </div>
                            <div className="flex flex-col space-y-1">
                              <button
                                onClick={handleSaveEdit}
                                className="p-1.5 bg-emerald-100 text-emerald-600 hover:bg-emerald-200 rounded-lg transition-colors border border-emerald-200"
                                title={t('glossary.save')}
                              >
                                <CheckCircle className="w-4 h-4" />
                              </button>
                              <button
                                onClick={handleCancelEdit}
                                className="p-1.5 bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800 rounded-lg transition-colors"
                                title={t('glossary.cancel')}
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </>
                        ) : (
                          // VIEW MODE
                          <>
                            <div className="flex-1 space-y-1">
                              <div className="flex flex-col space-y-0.5">
                                <span className="font-medium text-slate-800 text-base">
                                  {item.term}
                                </span>
                                <span className="text-brand-purple font-medium text-sm">
                                  {item.translation}
                                </span>
                                {item.notes && (
                                  <span className="text-xs text-slate-500 italic block mt-0.5">
                                    {item.notes}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => {
                                  setEditingTermIndex(originalIndex);
                                  setEditTermData({ ...item });
                                }}
                                className="p-1.5 text-slate-400 hover:text-brand-purple hover:bg-brand-purple/10 rounded-lg transition-colors"
                                title={t('glossary.edit')}
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => {
                                  const newItems = [...selectedGlossary.terms];
                                  newItems.splice(originalIndex, 1);
                                  handleUpdateTerms(newItems);
                                }}
                                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                title={t('glossary.delete')}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
              <div className="w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center mb-6">
                <Book className="w-12 h-12 opacity-30 text-slate-500" />
              </div>
              <p className="font-medium text-lg text-slate-600">{t('glossary.selectToManage')}</p>
            </div>
          )}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-slate-400 hover:text-slate-800 p-2 hover:bg-white/50 rounded-lg transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
      <GlossaryImportDialog
        isOpen={importDialogData.isOpen}
        onClose={() => setImportDialogData({ ...importDialogData, isOpen: false })}
        onConfirm={handleConfirmImport}
        glossaries={glossaries}
        importCount={importDialogData.items.length}
        defaultName={importDialogData.filename}
      />
    </div>
  );
};
