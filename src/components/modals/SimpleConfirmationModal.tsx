import React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, CheckCircle } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/lib/cn';

interface SimpleConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'info' | 'warning' | 'danger';
  hideCancelButton?: boolean;
}

export const SimpleConfirmationModal: React.FC<SimpleConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText,
  cancelText,
  type = 'info',
  hideCancelButton = false,
}) => {
  const { t } = useTranslation('common');
  const actualConfirmText = confirmText ?? t('confirm');
  const actualCancelText = cancelText ?? t('cancel');
  const getIcon = () => {
    switch (type) {
      case 'danger':
        return (
          <div className="p-2 bg-red-50 rounded-lg border border-red-100">
            <AlertCircle className="w-6 h-6 text-red-500" />
          </div>
        );
      case 'warning':
        return (
          <div className="p-2 bg-amber-50 rounded-lg border border-amber-100">
            <AlertCircle className="w-6 h-6 text-amber-500" />
          </div>
        );
      default:
        return (
          <div className="p-2 bg-brand-purple/10 rounded-lg border border-brand-purple/20">
            <CheckCircle className="w-6 h-6 text-brand-purple" />
          </div>
        );
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="md" zIndex={100} showCloseButton={false}>
      <div className="flex items-center space-x-3 mb-4">
        {getIcon()}
        <h3 className="text-lg font-bold text-slate-800">{title}</h3>
      </div>
      <p className="text-slate-600 mb-6 leading-relaxed">{message}</p>
      <div className="flex justify-end space-x-3">
        {!hideCancelButton && (
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors text-sm font-medium"
          >
            {actualCancelText}
          </button>
        )}
        <button
          onClick={() => {
            onConfirm();
            onClose();
          }}
          className={cn(
            'px-4 py-2 rounded-lg text-white text-sm font-medium transition-all shadow-md',
            type === 'danger' && 'bg-red-600 hover:bg-red-700 shadow-red-500/20',
            type === 'warning' && 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/20',
            type === 'info' && 'bg-brand-purple hover:bg-brand-purple/90 shadow-brand-purple/25'
          )}
        >
          {actualConfirmText}
        </button>
      </div>
    </Modal>
  );
};
