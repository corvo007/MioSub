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
        'flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-colors',
        highlight
          ? 'bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/15'
          : 'bg-white/5 border-white/10 hover:bg-white/8'
      )}
      onClick={onOpen}
    >
      <div className={cn(highlight ? 'text-emerald-400' : 'text-white/60')}>{icon}</div>
      <div className="flex-1 min-w-0">
        <div className={cn('font-medium', highlight ? 'text-emerald-300' : 'text-white')}>
          {label}
        </div>
        <div className="text-sm text-white/50 truncate">{filename}</div>
      </div>
      <FolderOpen className="w-5 h-5 text-white/40" />
    </div>
  );
}
