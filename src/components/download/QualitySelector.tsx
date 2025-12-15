/**
 * Quality Selector Component - Tailwind CSS Version
 */
import React from 'react';
import type { VideoFormat } from '@/types/download';

interface QualitySelectorProps {
  formats: VideoFormat[];
  selectedFormat: string;
  onSelect: (formatId: string) => void;
  disabled?: boolean;
}

export function QualitySelector({
  formats,
  selectedFormat,
  onSelect,
  disabled,
}: QualitySelectorProps) {
  const formatFilesize = (bytes?: number): string => {
    if (!bytes) return '';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  return (
    <div className="pt-4 mb-6 border-t border-white/10">
      <label className="block text-sm text-white/60 mb-3">画质选择</label>
      <div className="flex flex-wrap gap-3">
        {formats.map((format) => (
          <label
            key={format.formatId}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg cursor-pointer transition-colors
                            border ${
                              selectedFormat === format.formatId
                                ? 'bg-violet-500/20 border-violet-500/50'
                                : 'bg-white/5 border-white/10 hover:bg-white/10'
                            }
                            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <input
              type="radio"
              name="quality"
              value={format.formatId}
              checked={selectedFormat === format.formatId}
              onChange={() => onSelect(format.formatId)}
              disabled={disabled}
              className="accent-violet-500"
            />
            <span
              className={`text-sm ${selectedFormat === format.formatId ? 'text-violet-400' : 'text-white/80'}`}
            >
              {format.quality}
              {format.filesize && (
                <span className="ml-2 text-white/40 text-xs">
                  ~{formatFilesize(format.filesize)}
                </span>
              )}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
