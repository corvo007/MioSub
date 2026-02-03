import React from 'react';
import { AlertCircle, CheckCircle, MessageSquareText, X } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface ToastMessage {
  id: string;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success';
}

interface ToastContainerProps {
  toasts: ToastMessage[];
  removeToast: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, removeToast }) => {
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            'pointer-events-auto flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium animate-fade-in',
            toast.type === 'error' && 'bg-red-500/90 text-white',
            toast.type === 'warning' && 'bg-amber-500/90 text-white',
            toast.type === 'success' && 'bg-emerald-500/90 text-white',
            toast.type === 'info' && 'bg-slate-800/90 text-slate-200 border border-slate-700'
          )}
        >
          {toast.type === 'error' && <AlertCircle className="w-4 h-4" />}
          {toast.type === 'warning' && <AlertCircle className="w-4 h-4" />}
          {toast.type === 'success' && <CheckCircle className="w-4 h-4" />}
          {toast.type === 'info' && <MessageSquareText className="w-4 h-4" />}
          <span>{toast.message}</span>
          <button
            onClick={() => removeToast(toast.id)}
            className="ml-2 opacity-70 hover:opacity-100"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
  );
};
