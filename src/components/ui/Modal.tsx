import React, { useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  icon?: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl';
  zIndex?: number;
  showCloseButton?: boolean;
  contentClassName?: string;
  /** Whether pressing Escape closes the modal (default: true) */
  closeOnEscape?: boolean;
  /** Whether clicking the backdrop closes the modal (default: true) */
  closeOnBackdropClick?: boolean;
}

const maxWidthClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
};

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  children,
  title,
  icon,
  maxWidth = 'md',
  zIndex = 60,
  showCloseButton = true,
  contentClassName,
  closeOnEscape = true,
  closeOnBackdropClick = true,
}) => {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && closeOnEscape) {
        onClose();
      }
    },
    [onClose, closeOnEscape]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div
      className={cn(
        'fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in'
      )}
      style={{ zIndex }}
      onClick={(e) => e.target === e.currentTarget && closeOnBackdropClick && onClose()}
    >
      <div
        className={cn(
          'bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-white/50 dark:border-slate-700/50 rounded-2xl shadow-2xl shadow-brand-purple/10 w-full overflow-hidden relative transition-all',
          maxWidthClasses[maxWidth]
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute inset-0 bg-warm-mesh opacity-30 pointer-events-none" />
        {title && (
          <div className="flex items-center justify-between mb-6 relative z-10 px-6 pt-6">
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center">
              {icon && <span className="mr-2">{icon}</span>}
              {title}
            </h3>
            {showCloseButton && (
              <button
                onClick={onClose}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg p-1 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        )}
        <div className={cn('relative z-10', title ? 'px-6 pb-6' : 'p-6', contentClassName)}>
          {children}
        </div>
      </div>
    </div>
  );
};
