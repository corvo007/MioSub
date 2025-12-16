import React from 'react';
import { cn } from '@/lib/cn';

interface SettingRowProps {
  label: string;
  description?: string;
  children: React.ReactNode;
  indented?: boolean;
}

export const SettingRow: React.FC<SettingRowProps> = ({
  label,
  description,
  children,
  indented = false,
}) => (
  <div className={cn('flex items-center justify-between', indented && 'pl-4')}>
    <div>
      <label className="block text-sm font-medium text-slate-300">{label}</label>
      {description && <p className="text-xs text-slate-500">{description}</p>}
    </div>
    {children}
  </div>
);
