import React from 'react';

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
    className={`text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2 ${className}`}
  >
    {withDivider && <span className="w-8 h-px bg-slate-800" />}
    {icon}
    {children}
    {withDivider && <span className="flex-1 h-px bg-slate-800" />}
  </h3>
);
