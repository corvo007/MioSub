import React from 'react';
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
    'bg-transparent border border-white/20 text-white/70 hover:bg-white/5 hover:border-white/30',
  accent: 'bg-violet-500/20 border border-violet-500/30 text-violet-300 hover:bg-violet-500/30',
};

/**
 * Unified directory selector component with path display and select button.
 */
export const DirectorySelector: React.FC<DirectorySelectorProps> = ({
  value,
  placeholder = '未选择',
  onSelect,
  buttonText = '选择',
  variant = 'default',
  className = '',
}) => {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <span className="flex-1 px-3 py-2 bg-white/5 rounded-lg text-white/70 text-sm truncate">
        {value || placeholder}
      </span>
      <button
        onClick={onSelect}
        className={cn(
          'px-4 py-2 rounded-lg text-sm transition-colors flex items-center gap-1.5',
          buttonVariants[variant]
        )}
      >
        <FolderOpen className="w-4 h-4" />
        {buttonText}
      </button>
    </div>
  );
};
