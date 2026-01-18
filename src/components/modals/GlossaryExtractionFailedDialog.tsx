import React from 'react';
import { AlertCircle, Loader2, RefreshCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';

interface GlossaryExtractionFailedDialogProps {
  isOpen: boolean;
  isGeneratingGlossary: boolean;
  glossaryConfirmCallback: ((glossary: any[]) => void) | null;
  onRetry: () => void;
  onContinue: () => void;
}

export const GlossaryExtractionFailedDialog: React.FC<GlossaryExtractionFailedDialogProps> = ({
  isOpen,
  isGeneratingGlossary,
  glossaryConfirmCallback,
  onRetry,
  onContinue,
}) => {
  const { t } = useTranslation('modals');

  if (!glossaryConfirmCallback) return null;

  return (
    <Modal isOpen={isOpen} onClose={onContinue} maxWidth="md" zIndex={60} showCloseButton={false}>
      <div className="text-center space-y-4">
        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto border border-red-100 shadow-sm">
          <AlertCircle className="w-8 h-8 text-red-500" />
        </div>
        <h3 className="text-xl font-bold text-slate-800">
          {t('glossaryConfirmation.extractionFailed.title')}
        </h3>
        <p className="text-slate-600 text-sm">
          {t('glossaryConfirmation.extractionFailed.description')}
        </p>
        <div className="flex flex-col space-y-2 pt-4">
          <button
            onClick={onRetry}
            disabled={isGeneratingGlossary}
            className="w-full bg-linear-to-r from-brand-purple to-brand-purple/90 hover:brightness-110 text-white font-medium py-2 rounded-lg transition-colors flex items-center justify-center shadow-lg shadow-brand-purple/20"
          >
            {isGeneratingGlossary ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <RefreshCcw className="w-4 h-4 mr-2" />
            )}
            {isGeneratingGlossary
              ? t('glossaryConfirmation.extractionFailed.retryProcessing')
              : t('glossaryConfirmation.extractionFailed.retry')}
          </button>
          <button
            onClick={onContinue}
            disabled={isGeneratingGlossary}
            className="w-full bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-600 hover:text-slate-900 font-medium py-2 rounded-lg transition-all"
          >
            {t('glossaryConfirmation.extractionFailed.continue')}
          </button>
        </div>
      </div>
    </Modal>
  );
};
