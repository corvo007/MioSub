import React, { useState, useEffect } from 'react';
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

interface GlossaryManagerProps {
  glossaries: Glossary[];
  activeGlossaryId: string | null;
  onUpdateGlossaries: (glossaries: Glossary[]) => void;
  onSetActiveGlossary: (id: string) => void;
  onClose: () => void;
}

export const GlossaryManager: React.FC<GlossaryManagerProps> = ({
  glossaries,
  activeGlossaryId,
  onUpdateGlossaries,
  onSetActiveGlossary,
  onClose,
}) => {
  const [selectedGlossaryId, setSelectedGlossaryId] = useState<string | null>(activeGlossaryId);
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  // Term Editing State
  const [editingTermIndex, setEditingTermIndex] = useState<number | null>(null);
  const [editTermData, setEditTermData] = useState<GlossaryItem | null>(null);

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

  const handleAddGlossary = () => {
    const newGlossary = createGlossary(`新术语表 ${glossaries.length + 1}`);
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
    const updated = glossaries.map((g) =>
      g.id === selectedGlossaryId
        ? { ...g, terms: newItems, updatedAt: new Date().toISOString() }
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
        console.error('Import failed', err);
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
      const newGlossary = createGlossary(name);
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-5xl h-[85vh] flex shadow-2xl overflow-hidden relative">
        {/* Sidebar - Glossary List */}
        <div className="w-64 bg-slate-950 border-r border-slate-800 flex flex-col">
          <div className="p-4 border-b border-slate-800">
            <h2 className="text-lg font-bold text-white flex items-center">
              <Book className="w-5 h-5 mr-2 text-indigo-400" /> 术语表
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
            {glossaries.map((glossary) => (
              <div
                key={glossary.id}
                onClick={() => setSelectedGlossaryId(glossary.id)}
                className={cn(
                  'group relative flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all',
                  selectedGlossaryId === glossary.id
                    ? 'bg-indigo-600/20 border border-indigo-500/50'
                    : 'hover:bg-slate-800 border border-transparent'
                )}
              >
                {showDeleteConfirm === glossary.id ? (
                  <div className="absolute inset-0 bg-slate-900 flex items-center justify-between px-3 rounded-lg z-10 border border-red-500/30">
                    <span className="text-xs text-red-400 font-medium flex items-center">
                      <AlertCircle className="w-3 h-3 mr-1" /> 删除？
                    </span>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(glossary.id);
                        }}
                        className="px-2 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs rounded border border-red-500/30 transition-colors"
                      >
                        是
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowDeleteConfirm(null);
                        }}
                        className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs rounded border border-slate-700 transition-colors"
                      >
                        否
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
                      className="w-full bg-slate-900 border border-indigo-500 rounded px-2 py-1 text-sm text-white focus:outline-none"
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <div className="flex items-center">
                      <span
                        className={cn(
                          'text-sm font-medium truncate',
                          selectedGlossaryId === glossary.id ? 'text-white' : 'text-slate-300'
                        )}
                      >
                        {glossary.name}
                      </span>
                      {activeGlossaryId === glossary.id && (
                        <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/20">
                          当前使用
                        </span>
                      )}
                    </div>
                  )}
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {glossary.terms.length} 个术语
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
                    className="p-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-white"
                    title="重命名"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowDeleteConfirm(glossary.id);
                    }}
                    className="p-1.5 hover:bg-red-500/20 rounded text-slate-400 hover:text-red-400"
                    title="Delete"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="p-4 border-t border-slate-800 space-y-2">
            <button
              onClick={handleAddGlossary}
              className="w-full flex items-center justify-center space-x-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white py-2 rounded-lg transition-colors border border-slate-700"
            >
              <Plus className="w-4 h-4" />
              <span className="text-sm font-medium">新建术语表</span>
            </button>
            {glossaries.length === 0 && (
              <label className="w-full flex items-center justify-center space-x-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white py-2 rounded-lg transition-colors border border-slate-700 cursor-pointer">
                <Upload className="w-4 h-4" />
                <span className="text-sm font-medium">导入术语表</span>
                <input type="file" accept=".json" onChange={handleImport} className="hidden" />
              </label>
            )}
          </div>
        </div>

        {/* Main Content - Terms Editor */}
        <div className="flex-1 flex flex-col bg-slate-900 relative">
          {selectedGlossary ? (
            <>
              <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/50 pr-12">
                <div>
                  <h2 className="text-xl font-bold text-white flex items-center">
                    {selectedGlossary.name}
                    {activeGlossaryId === selectedGlossary.id && (
                      <span className="ml-3 px-2 py-0.5 rounded text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 flex items-center">
                        <CheckCircle className="w-3 h-3 mr-1" /> 当前使用
                      </span>
                    )}
                  </h2>
                  <p className="text-slate-500 text-sm mt-1">
                    最后更新: {new Date(selectedGlossary.updatedAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  {activeGlossaryId !== selectedGlossary.id && (
                    <button
                      onClick={() => onSetActiveGlossary(selectedGlossary.id)}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors flex items-center"
                    >
                      <CheckCircle className="w-4 h-4 mr-2" /> 设为当前
                    </button>
                  )}
                  <div className="h-6 w-px bg-slate-700 mx-2" />
                  <label
                    className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
                    title="导入 JSON"
                  >
                    <Download className="w-5 h-5" />
                    <input type="file" accept=".json" onChange={handleImport} className="hidden" />
                  </label>
                  <button
                    onClick={handleExport}
                    className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
                    title="导出 JSON"
                  >
                    <Upload className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="flex-1 flex flex-col min-h-0">
                {/* Search & Add */}
                <div className="p-4 border-b border-slate-800 flex space-x-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type="text"
                      placeholder="搜索术语..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                {/* Terms Table */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
                  <div className="space-y-2">
                    {/* Add New Term Row */}
                    <div className="flex items-start space-x-2 p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
                      <div className="flex-1 space-y-2">
                        <div className="flex space-x-2">
                          <input
                            placeholder="术语"
                            className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-indigo-500"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                const inputs =
                                  e.currentTarget.parentElement?.parentElement?.querySelectorAll(
                                    'input'
                                  );
                                const term = inputs?.[0].value;
                                const translation = inputs?.[1].value;
                                const notes = inputs?.[2].value;
                                if (term && translation) {
                                  handleUpdateTerms([
                                    ...selectedGlossary.terms,
                                    { term, translation, notes },
                                  ]);
                                  inputs.forEach((i) => (i.value = ''));
                                  inputs[0].focus();
                                }
                              }
                            }}
                          />
                          <input
                            placeholder="翻译"
                            className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                        <input
                          placeholder="备注 (可选)"
                          className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-400 focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                      <button
                        onClick={(e) => {
                          const container = e.currentTarget.parentElement;
                          const inputs = container?.querySelectorAll('input');
                          const term = inputs?.[0].value;
                          const translation = inputs?.[1].value;
                          const notes = inputs?.[2].value;
                          if (term && translation) {
                            handleUpdateTerms([
                              ...selectedGlossary.terms,
                              { term, translation, notes },
                            ]);
                            inputs.forEach((i) => (i.value = ''));
                            inputs[0].focus();
                          }
                        }}
                        className="p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Existing Terms */}
                    {selectedGlossary.terms
                      .map((item, index) => ({ item, originalIndex: index })) // Keep track of original index
                      .filter(
                        ({ item }) =>
                          item.term.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          item.translation.toLowerCase().includes(searchTerm.toLowerCase())
                      )
                      .map(({ item, originalIndex }) => (
                        <div
                          key={originalIndex}
                          className={cn(
                            'flex items-start space-x-2 p-3 rounded-lg border transition-all',
                            editingTermIndex === originalIndex
                              ? 'bg-indigo-900/20 border-indigo-500/50'
                              : 'hover:bg-slate-800/50 border-transparent hover:border-slate-700/50 group'
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
                                    className="flex-1 bg-slate-900 border border-indigo-500 rounded px-2 py-1 text-sm text-white focus:outline-none"
                                    placeholder="术语"
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
                                    className="flex-1 bg-slate-900 border border-indigo-500 rounded px-2 py-1 text-sm text-white focus:outline-none"
                                    placeholder="翻译"
                                  />
                                </div>
                                <input
                                  value={editTermData.notes || ''}
                                  onChange={(e) =>
                                    setEditTermData({ ...editTermData, notes: e.target.value })
                                  }
                                  className="w-full bg-slate-900 border border-indigo-500 rounded px-2 py-1 text-xs text-slate-300 focus:outline-none"
                                  placeholder="备注 (可选)"
                                  onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit()}
                                />
                              </div>
                              <div className="flex flex-col space-y-1">
                                <button
                                  onClick={handleSaveEdit}
                                  className="p-1.5 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 rounded transition-colors"
                                  title="保存"
                                >
                                  <CheckCircle className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={handleCancelEdit}
                                  className="p-1.5 bg-slate-700 text-slate-400 hover:bg-slate-600 hover:text-white rounded transition-colors"
                                  title="取消"
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
                                  <span className="font-medium text-white">{item.term}</span>
                                  <span className="text-indigo-400 text-sm">
                                    {item.translation}
                                  </span>
                                  {item.notes && (
                                    <span className="text-xs text-slate-500 italic">
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
                                  className="p-1.5 text-slate-500 hover:text-indigo-400 hover:bg-indigo-500/10 rounded transition-colors"
                                  title="编辑"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => {
                                    const newItems = [...selectedGlossary.terms];
                                    newItems.splice(originalIndex, 1);
                                    handleUpdateTerms(newItems);
                                  }}
                                  className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                                  title="删除"
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
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
              <Book className="w-16 h-16 mb-4 opacity-20" />
              <p>选择一个术语表以管理术语</p>
            </div>
          )}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-slate-400 hover:text-white"
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
