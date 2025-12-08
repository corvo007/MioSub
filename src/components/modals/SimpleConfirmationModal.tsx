import React from 'react';
import { AlertCircle, CheckCircle } from 'lucide-react';

interface SimpleConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'info' | 'warning' | 'danger';
}

export const SimpleConfirmationModal: React.FC<SimpleConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = '确认',
  cancelText = '取消',
  type = 'info',
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-md w-full shadow-2xl transform transition-all scale-100">
        <div className="flex items-center space-x-3 mb-4">
          {type === 'danger' && (
            <div className="p-2 bg-red-500/20 rounded-lg">
              <AlertCircle className="w-6 h-6 text-red-400" />
            </div>
          )}
          {type === 'warning' && (
            <div className="p-2 bg-amber-500/20 rounded-lg">
              <AlertCircle className="w-6 h-6 text-amber-400" />
            </div>
          )}
          {type === 'info' && (
            <div className="p-2 bg-indigo-500/20 rounded-lg">
              <CheckCircle className="w-6 h-6 text-indigo-400" />
            </div>
          )}
          <h3 className="text-lg font-bold text-white">{title}</h3>
        </div>
        <p className="text-slate-300 mb-6 leading-relaxed">{message}</p>
        <div className="flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors text-sm font-medium"
          >
            {cancelText}
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors shadow-lg ${
              type === 'danger'
                ? 'bg-red-600 hover:bg-red-500 shadow-red-500/20'
                : type === 'warning'
                  ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-500/20'
                  : 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-500/20'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
