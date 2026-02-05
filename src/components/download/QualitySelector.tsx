/**
 * Quality Selector Component - Tailwind CSS Version
 */
import { useTranslation } from 'react-i18next';
import type { VideoFormat } from '@/types/download';
import { cn } from '@/lib/cn';

interface QualitySelectorProps {
  formats: VideoFormat[];
  selectedFormat: string;
  onSelect: (formatId: string) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
}

export function QualitySelector({
  formats,
  selectedFormat,
  onSelect,
  disabled,
  label,
  className = '',
}: QualitySelectorProps) {
  const { t } = useTranslation('download');
  const displayLabel = label || t('qualityLabel');

  const formatFilesize = (bytes?: number): string => {
    if (!bytes) return '';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  return (
    <div className={className}>
      <label className="block text-sm font-semibold text-slate-600 mb-3">{displayLabel}</label>
      <div className="flex flex-wrap gap-2 md:gap-3">
        {formats.map((format) => (
          <button
            key={format.quality}
            type="button"
            onClick={() => !disabled && onSelect(format.quality)}
            className={cn(
              'px-4 py-2 rounded-lg text-sm transition-all border shadow-sm',
              selectedFormat === format.quality
                ? 'bg-brand-purple/10 border-brand-purple text-brand-purple font-semibold shadow-brand-purple/10'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
          >
            {format.quality}
            {format.filesize && (
              <span className="ml-2 text-slate-400 text-xs font-normal">
                ~{formatFilesize(format.filesize)}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
