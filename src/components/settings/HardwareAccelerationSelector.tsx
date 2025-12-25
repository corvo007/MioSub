import React from 'react';
import { useTranslation } from 'react-i18next';
import { Zap, Cpu, Loader2 } from 'lucide-react';
import type { HardwareAccelInfo } from '@/types/compression';
import { cn } from '@/lib/cn';

interface HardwareAccelerationSelectorProps {
  hwAccelInfo: HardwareAccelInfo | null;
  enabled: boolean;
  onToggle: () => void;
  encoder: string; // 'libx264' or 'libx265'
}

/**
 * Hardware Acceleration toggle selector for video compression.
 * Displays GPU acceleration status and available encoders.
 */
export const HardwareAccelerationSelector: React.FC<HardwareAccelerationSelectorProps> = ({
  hwAccelInfo,
  enabled,
  onToggle,
  encoder,
}) => {
  const { t } = useTranslation('ui');
  const isLoading = !hwAccelInfo;
  const isAvailable = hwAccelInfo?.available ?? false;
  const isEnabled = enabled && isAvailable;

  const getPreferredEncoder = () => {
    if (!hwAccelInfo) return '';
    return encoder === 'libx264' ? hwAccelInfo.preferredH264 : hwAccelInfo.preferredH265;
  };

  return (
    <div className="space-y-2">
      <button
        onClick={() => isAvailable && onToggle()}
        disabled={isLoading || !isAvailable}
        className={cn(
          'w-full flex flex-col md:flex-row items-start md:items-center justify-between p-3 md:p-4 rounded-lg border transition-all gap-4 md:gap-0',
          isLoading && 'bg-slate-800/50 border-slate-700/50 cursor-wait opacity-70',
          !isLoading &&
            !isAvailable &&
            'bg-slate-800/50 border-slate-700/50 cursor-not-allowed opacity-60',
          !isLoading &&
            isAvailable &&
            isEnabled &&
            'bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/20',
          !isLoading &&
            isAvailable &&
            !isEnabled &&
            'bg-slate-800 border-slate-700 hover:bg-slate-700'
        )}
      >
        <div className="flex items-center gap-3">
          {isLoading ? (
            <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
          ) : !isAvailable ? (
            <Cpu className="w-5 h-5 text-slate-500" />
          ) : isEnabled ? (
            <Zap className="w-5 h-5 text-emerald-400" />
          ) : (
            <Cpu className="w-5 h-5 text-slate-400" />
          )}

          <div className="text-left">
            <div
              className={cn(
                'font-medium',
                isLoading && 'text-slate-400',
                !isLoading && !isAvailable && 'text-slate-500',
                !isLoading && isAvailable && isEnabled && 'text-emerald-300',
                !isLoading && isAvailable && !isEnabled && 'text-slate-300'
              )}
            >
              {isLoading
                ? t('hardwareAcceleration.detecting')
                : !isAvailable
                  ? t('hardwareAcceleration.unavailable')
                  : isEnabled
                    ? t('hardwareAcceleration.gpuEnabled')
                    : t('hardwareAcceleration.cpuMode')}
            </div>
            <div className="text-xs text-slate-500">
              {isLoading
                ? t('hardwareAcceleration.detectingSupport')
                : !isAvailable
                  ? t('hardwareAcceleration.noGpuDetected')
                  : isEnabled
                    ? t('hardwareAcceleration.willUseEncoder', { encoder: getPreferredEncoder() })
                    : t('hardwareAcceleration.forceCpu')}
            </div>
          </div>
        </div>

        <div
          className={cn(
            'w-10 h-5 rounded-full relative transition-colors shrink-0 self-end md:self-auto',
            (isLoading || !isAvailable) && 'bg-slate-700',
            !isLoading && isAvailable && isEnabled && 'bg-emerald-500',
            !isLoading && isAvailable && !isEnabled && 'bg-slate-600'
          )}
        >
          <div
            className={cn(
              'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-md transition-all',
              isEnabled ? 'left-5' : 'left-0.5'
            )}
          />
        </div>
      </button>

      {/* Encoder Badges */}
      {isAvailable && isEnabled && hwAccelInfo && (
        <div className="text-xs text-slate-500 flex items-center gap-2 flex-wrap">
          <span>{t('hardwareAcceleration.availableEncoders')}</span>
          {hwAccelInfo.encoders.h264_nvenc && (
            <span className="px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded">NVENC</span>
          )}
          {hwAccelInfo.encoders.h264_qsv && (
            <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded">QSV</span>
          )}
          {hwAccelInfo.encoders.h264_amf && (
            <span className="px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded">AMF</span>
          )}
        </div>
      )}
    </div>
  );
};
