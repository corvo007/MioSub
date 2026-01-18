import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/cn';

interface PageHeaderProps {
  /** Main Title */
  title: string | React.ReactNode;
  /** Subtitle */
  subtitle?: string;
  /** Left Icon */
  icon?: React.ReactNode;
  /** Back Button Callback */
  onBack?: () => void;
  /** Right Actions */
  actions?: React.ReactNode;
}

/**
 * Universal Page Header
 * Unified style for all pages, responsive.
 */
export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  icon,
  onBack,
  actions,
}) => {
  return (
    <header
      className={cn(
        'flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 pb-3 sm:pb-4 border-b border-black/5 shrink-0 window-drag-region'
      )}
      style={{ WebkitAppRegion: 'drag' } as any}
    >
      <div className="flex items-center space-x-3 sm:space-x-4 min-w-0">
        {/* Back Button or Icon */}
        {onBack ? (
          <button
            onClick={onBack}
            className="p-1.5 sm:p-2 hover:bg-black/5 rounded-lg transition-colors text-slate-500 hover:text-slate-900 shrink-0"
          >
            <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        ) : icon ? (
          <div className="p-2 sm:p-3 bg-linear-to-br from-brand-purple to-brand-orange rounded-lg sm:rounded-xl shadow-lg shadow-brand-purple/20 shrink-0">
            {icon}
          </div>
        ) : null}

        {/* Title Area */}
        <div className="min-w-0">
          <h1 className="text-lg sm:text-2xl font-bold text-slate-800 flex items-center gap-2 flex-wrap">
            {typeof title === 'string' ? <span className="truncate">{title}</span> : title}
          </h1>
          {subtitle && (
            <p className="text-xs text-slate-500 truncate max-w-50 sm:max-w-100 md:max-w-150">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {/* Right Actions */}
      {actions && (
        <div className="flex items-center space-x-1.5 sm:space-x-2 shrink-0">{actions}</div>
      )}
    </header>
  );
};

/**
 * Universal Header Button
 * Unified button style
 */
interface HeaderButtonProps {
  onClick: () => void;
  icon: React.ReactNode;
  label?: string;
  title?: string;
  /** Icon Hover Color */
  hoverColor?: 'blue' | 'indigo' | 'emerald' | 'amber';
  /** Highlighted State */
  highlighted?: boolean;
}

export const HeaderButton: React.FC<HeaderButtonProps> = ({
  onClick,
  icon,
  label,
  title,
  hoverColor = 'blue',
  highlighted = false,
}) => {
  const hoverColorClass = {
    blue: 'group-hover:text-blue-500',
    indigo: 'group-hover:text-brand-purple',
    emerald: 'group-hover:text-emerald-500',
    amber: 'group-hover:text-brand-orange',
  }[hoverColor];

  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center space-x-1.5 sm:space-x-2 px-2 sm:px-4 py-1.5 sm:py-2 border rounded-lg transition-all text-xs sm:text-sm font-medium group shadow-sm',
        highlighted
          ? 'bg-brand-purple/10 border-brand-purple/20 text-brand-purple'
          : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-600'
      )}
      title={title}
    >
      <span className={cn('text-slate-400 transition-colors', hoverColorClass)}>{icon}</span>
      {label && (
        <span className="hidden sm:inline group-hover:text-slate-900 transition-colors">
          {label}
        </span>
      )}
    </button>
  );
};
