import React from 'react';
import { CheckCircle, AlertCircle } from 'lucide-react';
import { GenerationStatus } from '@/types/api';

interface StatusBadgeProps {
  status: GenerationStatus;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  switch (status) {
    case GenerationStatus.COMPLETED:
      return (
        <div className="flex items-center space-x-2 text-emerald-400 bg-emerald-400/10 px-4 py-2 rounded-full border border-emerald-500/20">
          <CheckCircle className="w-4 h-4" />
          <span className="text-sm font-medium">完成</span>
        </div>
      );
    case GenerationStatus.ERROR:
      return (
        <div className="flex items-center space-x-2 text-red-400 bg-red-400/10 px-4 py-2 rounded-full border border-red-500/20">
          <AlertCircle className="w-4 h-4" />
          <span className="text-sm font-medium">错误</span>
        </div>
      );
    default:
      return null;
  }
};
