import React from 'react';
import { cn } from '@/lib/cn';

interface OptionButtonProps {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  color?: 'indigo' | 'violet';
  size?: 'sm' | 'md';
  fullWidth?: boolean;
  className?: string;
}

export const OptionButton: React.FC<OptionButtonProps> = ({
  selected,
  onClick,
  children,
  color = 'indigo',
  size = 'sm',
  fullWidth = false,
  className = '',
}) => {
  const colorClasses = {
    indigo: selected
      ? 'bg-brand-purple/10 border-brand-purple/30 text-brand-purple font-medium shadow-sm ring-1 ring-brand-purple/10'
      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900 shadow-sm',
    violet: selected
      ? 'bg-violet-100 border-violet-200 text-violet-700 font-medium ring-1 ring-violet-200'
      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300',
  };

  const sizeClasses = {
    sm: 'px-3 py-2',
    md: 'p-3',
  };

  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-lg text-sm border transition-all flex items-center justify-center space-x-2',
        sizeClasses[size],
        colorClasses[color],
        fullWidth && 'w-full',
        className
      )}
    >
      {children}
    </button>
  );
};
