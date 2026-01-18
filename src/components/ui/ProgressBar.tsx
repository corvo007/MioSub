import React from 'react';
import { cn } from '@/lib/cn';

interface ProgressBarProps {
  percent: number;
  variant?: 'primary' | 'success' | 'error';
  size?: 'sm' | 'md';
  showShimmer?: boolean;
  indeterminate?: boolean;
  className?: string;
}

const variantClasses = {
  primary: 'bg-linear-to-r from-violet-500 to-indigo-500',
  success: 'bg-linear-to-r from-emerald-500 to-teal-500',
  error: 'bg-linear-to-r from-red-500 to-orange-500',
};

const sizeClasses = {
  sm: 'h-2',
  md: 'h-3',
};

/**
 * Unified progress bar component with variants, sizes, and animation options.
 */
export const ProgressBar: React.FC<ProgressBarProps> = ({
  percent,
  variant = 'primary',
  size = 'sm',
  showShimmer = false,
  indeterminate = false,
  className = '',
}) => {
  const clampedPercent = Math.min(Math.max(percent, 0), 100);

  return (
    <div
      className={cn(
        'w-full bg-slate-200 rounded-full overflow-hidden',
        sizeClasses[size],
        className
      )}
    >
      {indeterminate ? (
        <div
          className={cn(
            'h-full w-full opacity-50 rounded-full animate-pulse',
            variantClasses[variant]
          )}
        />
      ) : (
        <div
          className={cn(
            'h-full rounded-full transition-all duration-300 ease-out relative overflow-hidden',
            variantClasses[variant]
          )}
          style={{ width: `${clampedPercent}%` }}
        >
          {showShimmer && <div className="absolute inset-0 bg-white/20 animate-shimmer" />}
        </div>
      )}
    </div>
  );
};
