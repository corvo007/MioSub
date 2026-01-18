import React from 'react';
import { cn } from '@/lib/cn';

interface SettingRowProps {
  label: string;
  description?: string | React.ReactNode;
  children: React.ReactNode;
  indented?: boolean;
  disabled?: boolean;
}

export const SettingRow: React.FC<SettingRowProps> = ({
  label,
  description,
  children,
  indented = false,
  disabled = false,
}) => (
  <div
    className={cn(
      'flex items-center justify-between transition-opacity duration-200',
      indented && 'pl-4',
      disabled && 'opacity-50 pointer-events-none'
    )}
  >
    <div>
      <label className="block text-sm font-medium text-slate-700">{label}</label>
      {description && <p className="text-xs text-slate-500">{description}</p>}
    </div>
    <div className={cn(disabled && 'pointer-events-auto cursor-not-allowed')}>
      {/* Start wrapper for children to handle pointer-events correctly if needed, 
      but 'pointer-events-auto' on children wrapper allows interaction with children if we wanted, 
      however here we actually want to BLOCK interaction generally.
      
      Actually 'pointer-events-none' on parent blocks everything. 
      If we want the toggle inside to be visibly disabled (which it is via its own prop), 
      opacity on parent is the main visual cue we want. */}
      {children}
    </div>
  </div>
);
