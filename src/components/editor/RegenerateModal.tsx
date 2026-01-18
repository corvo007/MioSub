import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { X, RefreshCw } from 'lucide-react';
import { type RegeneratePrompts } from '@/types/subtitle';
import { cn } from '@/lib/cn';

interface RegenerateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (prompts: RegeneratePrompts) => void;
  selectedCount: number;
}

export const RegenerateModal: React.FC<RegenerateModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  selectedCount,
}) => {
  const { t } = useTranslation('editor');
  const [transcriptionHint, setTranscriptionHint] = useState('');
  const [translationHint, setTranslationHint] = useState('');

  const handleConfirm = () => {
    onConfirm({
      transcriptionHint: transcriptionHint.trim() || undefined,
      translationHint: translationHint.trim() || undefined,
    });
    // Reset state
    setTranscriptionHint('');
    setTranslationHint('');
  };

  const handleClose = () => {
    setTranscriptionHint('');
    setTranslationHint('');
    onClose();
  };

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-60 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 animate-fade-in ring-1 ring-slate-900/5">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/50 rounded-t-xl">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-brand-purple/10 border border-brand-purple/10">
              <RefreshCw className="w-5 h-5 text-brand-purple" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-800">{t('regenerateModal.title')}</h3>
              <p className="text-xs text-slate-500">
                {t('regenerateModal.subtitle', { count: selectedCount })}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-4 space-y-4">
          {/* Info */}
          <div className="p-3 rounded-lg bg-brand-purple/5 border border-brand-purple/10 text-brand-purple/80">
            <p className="text-xs font-medium leading-relaxed">{t('regenerateModal.info')}</p>
          </div>

          {/* Transcription Hint */}
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1.5">
              {t('regenerateModal.transcriptionHint')}
            </label>
            <textarea
              value={transcriptionHint}
              onChange={(e) => setTranscriptionHint(e.target.value)}
              placeholder={t('regenerateModal.transcriptionHintPlaceholder')}
              className="w-full h-20 px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-700 placeholder-slate-400 focus:border-brand-purple focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-purple/20 resize-none transition-all"
            />
          </div>

          {/* Translation Hint */}
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1.5">
              {t('regenerateModal.translationHint')}
            </label>
            <textarea
              value={translationHint}
              onChange={(e) => setTranslationHint(e.target.value)}
              placeholder={t('regenerateModal.translationHintPlaceholder')}
              className="w-full h-20 px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-700 placeholder-slate-400 focus:border-brand-orange focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-orange/20 resize-none transition-all"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-slate-100 bg-slate-50/30 rounded-b-xl">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-all"
          >
            {t('regenerateModal.cancel')}
          </button>
          <button
            onClick={handleConfirm}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all shadow-md hover:shadow-lg',
              'bg-linear-to-r from-brand-purple to-brand-orange text-white hover:opacity-95 hover:shadow-brand-purple/20 border-none'
            )}
          >
            <RefreshCw className="w-4 h-4" />
            {t('regenerateModal.confirm')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
