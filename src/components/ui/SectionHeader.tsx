import React from 'react';
import { cn } from '@/lib/cn';

interface SectionHeaderProps {
  children: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
  withDivider?: boolean;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  children,
  icon,
  className = '',
  withDivider = false,
}) => (
  <h3
    className={cn(
      'text-sm font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2',
      className
    )}
  >
    {withDivider && <span className="w-8 h-px bg-slate-200" />}
    {icon}
    {children}
    {withDivider && <span className="flex-1 h-px bg-slate-200" />}
  </h3>
);
