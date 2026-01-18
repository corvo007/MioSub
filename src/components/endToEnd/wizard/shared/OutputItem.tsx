import React from 'react';
import { FolderOpen } from 'lucide-react';
import { getFilename } from '@/services/utils/path';
import { cn } from '@/lib/cn';

/** 输出项组件 */
export function OutputItem({
  icon,
  label,
  path,
  onOpen,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  path: string;
  onOpen: () => void;
  highlight?: boolean;
}) {
  const filename = getFilename(path) || path;

  return (
    <div
      className={cn(
        'flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-colors shadow-sm',
        highlight
          ? 'bg-emerald-50 border-emerald-200 hover:bg-emerald-100/50'
          : 'bg-white border-slate-200 hover:bg-slate-50'
      )}
      onClick={onOpen}
    >
      <div className={cn(highlight ? 'text-emerald-500' : 'text-slate-400')}>{icon}</div>
      <div className="flex-1 min-w-0">
        <div className={cn('font-medium', highlight ? 'text-emerald-700' : 'text-slate-700')}>
          {label}
        </div>
        <div className="text-sm text-slate-500 truncate">{filename}</div>
      </div>
      <FolderOpen className="w-5 h-5 text-slate-400" />
    </div>
  );
}
