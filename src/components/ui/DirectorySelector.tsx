import React from 'react';
import { useTranslation } from 'react-i18next';
import { FolderOpen } from 'lucide-react';
import { cn } from '@/lib/cn';

interface DirectorySelectorProps {
  value: string;
  placeholder?: string;
  onSelect: () => void;
  buttonText?: string;
  variant?: 'default' | 'accent';
  className?: string;
}

const buttonVariants = {
  default:
    'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 hover:text-slate-800 shadow-sm',
  accent:
    'bg-brand-purple/10 border border-brand-purple/20 text-brand-purple hover:bg-brand-purple/20',
};

/**
 * Unified directory selector component with path display and select button.
 */
export const DirectorySelector: React.FC<DirectorySelectorProps> = ({
  value,
  placeholder,
  onSelect,
  buttonText,
  variant = 'default',
  className = '',
}) => {
  const { t } = useTranslation('ui');
  const displayPlaceholder = placeholder ?? t('directorySelector.notSelected');
  const displayButtonText = buttonText ?? t('directorySelector.select');

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 text-sm truncate min-w-0 shadow-inner">
        {value || <span className="text-slate-400">{displayPlaceholder}</span>}
      </div>
      <button
        onClick={onSelect}
        className={cn(
          'px-4 py-2 rounded-lg text-sm transition-all flex items-center gap-1.5 font-medium',
          buttonVariants[variant]
        )}
      >
        <FolderOpen className="w-4 h-4" />
        {displayButtonText}
      </button>
    </div>
  );
};
