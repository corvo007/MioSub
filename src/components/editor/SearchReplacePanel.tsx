import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  X,
  Replace,
  ChevronUp,
  ChevronDown,
  CheckSquare,
  Square,
  GripHorizontal,
} from 'lucide-react';
import { Rnd } from 'react-rnd';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';

interface SearchReplacePanelProps {
  isOpen: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  // Search state
  searchPattern: string;
  replaceWith: string;
  isRegex: boolean;
  caseSensitive: boolean;
  currentMatchIndex: number;
  totalMatches: number;
  // Callbacks
  onSearchChange: (pattern: string) => void;
  onReplaceChange: (text: string) => void;
  onRegexChange: (value: boolean) => void;
  onCaseSensitiveChange: (value: boolean) => void;
  onReplaceCurrent: () => void;
  onReplaceAll: () => void;
  onNavigate: (direction: 'prev' | 'next') => void;
}

export const SearchReplacePanel: React.FC<SearchReplacePanelProps> = ({
  isOpen,
  onClose,
  anchorRef,
  searchPattern,
  replaceWith,
  isRegex,
  caseSensitive,
  currentMatchIndex,
  totalMatches,
  onSearchChange,
  onReplaceChange,
  onRegexChange,
  onCaseSensitiveChange,
  onReplaceCurrent,
  onReplaceAll,
  onNavigate,
}) => {
  const { t } = useTranslation('editor');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Position state for draggable panel
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [initialized, setInitialized] = useState(false);

  // Initialize position based on anchor when opened
  useEffect(() => {
    if (isOpen && anchorRef.current && !initialized) {
      const rect = anchorRef.current.getBoundingClientRect();
      setPosition({
        x: Math.max(8, rect.left),
        y: rect.bottom + 8,
      });
      setInitialized(true);
    }
    if (!isOpen) {
      setInitialized(false);
    }
  }, [isOpen, anchorRef, initialized]);

  // Focus search input when opened
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }, 100);
    }
  }, [isOpen]);

  // Handle keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if focus is within panel
      if (!panelRef.current?.contains(document.activeElement)) return;

      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) {
          onReplaceAll();
        } else {
          onNavigate('next');
        }
      } else if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        onNavigate('prev');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, onNavigate, onReplaceAll]);

  if (!isOpen) return null;

  return createPortal(
    <Rnd
      position={position}
      onDragStop={(_e, d) => setPosition({ x: d.x, y: d.y })}
      enableResizing={false}
      dragHandleClassName="drag-handle"
      bounds="window"
      style={{ zIndex: 9999 }}
    >
      <div
        ref={panelRef}
        className="bg-white rounded-lg shadow-xl border border-slate-200 p-4 w-80 animate-fade-in ring-1 ring-slate-900/5"
      >
        {/* Header with drag handle */}
        <div className="flex items-center justify-between mb-3 drag-handle cursor-move">
          <div className="flex items-center gap-2">
            <GripHorizontal className="w-4 h-4 text-slate-300" />
            <span className="text-sm font-medium text-slate-600">{t('searchReplace.title')}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search Input */}
        <div className="relative mb-2">
          <input
            ref={searchInputRef}
            type="text"
            value={searchPattern}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t('searchReplace.searchPlaceholder')}
            className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-md text-slate-700 placeholder-slate-400 focus:border-brand-purple focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-purple/20 transition-all"
          />
        </div>

        {/* Replace Input */}
        <div className="relative mb-3">
          <input
            type="text"
            value={replaceWith}
            onChange={(e) => onReplaceChange(e.target.value)}
            placeholder={t('searchReplace.replacePlaceholder')}
            className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-md text-slate-700 placeholder-slate-400 focus:border-brand-purple focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-purple/20 transition-all"
          />
        </div>

        {/* Options Row */}
        <div className="flex items-center gap-2 mb-3">
          <button
            onClick={() => onRegexChange(!isRegex)}
            className={cn(
              'flex items-center gap-1 px-2 py-1 text-xs rounded border transition-colors',
              isRegex
                ? 'bg-brand-purple/10 border-brand-purple/20 text-brand-purple font-medium'
                : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
            )}
            title={t('searchReplace.regex')}
          >
            {isRegex ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
            .*
          </button>

          <button
            onClick={() => onCaseSensitiveChange(!caseSensitive)}
            className={cn(
              'flex items-center gap-1 px-2 py-1 text-xs rounded border transition-colors',
              caseSensitive
                ? 'bg-brand-purple/10 border-brand-purple/20 text-brand-purple font-medium'
                : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
            )}
            title={t('searchReplace.caseSensitive')}
          >
            {caseSensitive ? (
              <CheckSquare className="w-3.5 h-3.5" />
            ) : (
              <Square className="w-3.5 h-3.5" />
            )}
            Aa
          </button>

          {/* Match counter & navigation */}
          <div className="flex items-center gap-1 ml-auto">
            <span className="text-xs text-slate-500 min-w-14 text-right">
              {totalMatches > 0
                ? `${currentMatchIndex + 1}/${totalMatches}`
                : t('searchReplace.noResults')}
            </span>
            <button
              onClick={() => onNavigate('prev')}
              disabled={totalMatches === 0}
              className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title={t('searchReplace.prevMatch')}
            >
              <ChevronUp className="w-4 h-4" />
            </button>
            <button
              onClick={() => onNavigate('next')}
              disabled={totalMatches === 0}
              className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title={t('searchReplace.nextMatch')}
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={onReplaceCurrent}
            disabled={totalMatches === 0}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-all',
              totalMatches > 0
                ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                : 'bg-slate-50 text-slate-400 cursor-not-allowed'
            )}
          >
            <Replace className="w-4 h-4" />
            {t('searchReplace.replace')}
          </button>

          <button
            onClick={onReplaceAll}
            disabled={totalMatches === 0}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-all',
              totalMatches > 0
                ? 'bg-brand-purple text-white hover:bg-brand-purple/90'
                : 'bg-slate-50 text-slate-400 cursor-not-allowed'
            )}
          >
            <Replace className="w-4 h-4" />
            {t('searchReplace.replaceAll')}
            {totalMatches > 0 && <span>({totalMatches})</span>}
          </button>
        </div>

        {/* Keyboard hints */}
        <div className="mt-2 text-[10px] text-slate-400 text-center">
          Enter: {t('searchReplace.nextHint')} · Ctrl+Enter: {t('searchReplace.replaceAllHint')}
        </div>
      </div>
    </Rnd>,
    document.body
  );
};

export default SearchReplacePanel;
