import React from 'react';
import { CheckCircle, XCircle, Film, FileText, Wand2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/cn';
import { OutputItem } from '@/components/endToEnd/wizard/shared/OutputItem';
import { PrimaryButton } from '@/components/ui/PrimaryButton';

/** 步骤 4: 结果展示 */
export function StepResult({
  result,
  onReset,
  onClose,
}: {
  result?: any;
  onReset: () => void;
  onClose: () => void;
}) {
  const success = result?.success;
  const outputs = result?.outputs || {};

  const handleOpenFolder = (path: string) => {
    if (window.electronAPI?.showItemInFolder) {
      void window.electronAPI.showItemInFolder(path);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <div
          className={cn(
            'inline-flex items-center justify-center w-16 h-16 rounded-2xl border mb-4',
            success
              ? 'bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border-emerald-500/30'
              : 'bg-gradient-to-br from-red-500/20 to-orange-500/20 border-red-500/30'
          )}
        >
          {success ? (
            <CheckCircle className="w-8 h-8 text-emerald-400" />
          ) : (
            <XCircle className="w-8 h-8 text-red-400" />
          )}
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">{success ? '处理完成' : '处理失败'}</h2>
        <p className="text-white/60">
          {success
            ? `耗时 ${Math.round((result?.duration || 0) / 1000 / 60)} 分钟`
            : result?.error || '发生未知错误'}
        </p>
      </div>

      {/* Outputs */}
      {success && (
        <div className="space-y-3 mb-8">
          {outputs.videoPath && (
            <OutputItem
              icon={<Film className="w-5 h-5" />}
              label="原始视频"
              path={outputs.videoPath}
              onOpen={() => handleOpenFolder(outputs.videoPath)}
            />
          )}
          {outputs.subtitlePath && (
            <OutputItem
              icon={<FileText className="w-5 h-5" />}
              label="字幕文件"
              path={outputs.subtitlePath}
              onOpen={() => handleOpenFolder(outputs.subtitlePath)}
            />
          )}
          {outputs.outputVideoPath && (
            <OutputItem
              icon={<Wand2 className="w-5 h-5" />}
              label="压制视频"
              path={outputs.outputVideoPath}
              onOpen={() => handleOpenFolder(outputs.outputVideoPath)}
              highlight
            />
          )}
        </div>
      )}

      {/* Error Details */}
      {!success && result?.errorDetails && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl mb-8">
          <div className="text-red-200 text-sm">
            <p className="font-medium mb-1">错误阶段: {result.errorDetails.stage}</p>
            <p className="text-red-300/70">{result.errorDetails.message}</p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-4 justify-center">
        <button
          onClick={onReset}
          className="px-6 py-3 bg-white/10 border border-white/20 rounded-xl text-white font-medium transition-colors hover:bg-white/15"
        >
          <span className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4" />
            处理新视频
          </span>
        </button>
        <PrimaryButton onClick={onClose}>完成</PrimaryButton>
      </div>
    </div>
  );
}
