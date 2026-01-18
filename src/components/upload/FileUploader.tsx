import React from 'react';
import { RefreshCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';
import { logger } from '@/services/utils/logger';

interface FileUploaderProps {
  hasFile: boolean;
  fileName?: string;
  fileInfo?: React.ReactNode;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onFileSelectNative?: (file: File) => void; // Callback for native dialog (receives File with path)
  onNativeClick?: () => void; // Generic callback for native dialog click (no File returned)
  onLoadingStart?: () => void; // Called before file reading starts (for loading indicators)
  disabled?: boolean;
  accept: string;
  icon: React.ReactNode;
  uploadTitle: React.ReactNode;
  uploadDescription?: React.ReactNode;
  heightClass?: string;
  activeTab?: string;
  error?: boolean;
  useNativeDialog?: boolean; // Use Electron native dialog
}

export const FileUploader: React.FC<FileUploaderProps> = ({
  hasFile,
  fileName,
  fileInfo,
  onFileSelect,
  onFileSelectNative,
  onNativeClick,
  onLoadingStart,
  disabled = false,
  accept,
  icon,
  uploadTitle,
  uploadDescription,
  heightClass = 'h-32',
  error = false,
  useNativeDialog = false,
}) => {
  const { t } = useTranslation('ui');
  // Handle click for native dialog
  const handleNativeClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (disabled) return;

    // If a generic native click handler is provided, use it
    if (onNativeClick) {
      onNativeClick();
      return;
    }

    // Otherwise use the media file selection with File callback
    if (!window.electronAPI?.selectMediaFile || !onFileSelectNative) return;

    try {
      const result = await window.electronAPI.selectMediaFile();
      if (result.success && result.filePath && result.fileName) {
        // Create a minimal File-like object with path for parent to handle
        // Parent (useWorkspaceLogic) will check for confirmation first, then process
        const fileStub = {
          name: result.fileName,
          path: result.filePath,
          type: result.type || 'application/octet-stream',
          size: result.size || 0,
          _needsRead: true, // Flag to indicate this is a stub with path
        } as unknown as File & { path: string; _needsRead?: boolean };

        onFileSelectNative(fileStub);
      }
    } catch (err) {
      logger.error('Failed to select media file', err);
    }
  };

  const isElectron = !!window.electronAPI?.isElectron;
  const shouldUseNative = useNativeDialog && isElectron && (onFileSelectNative || onNativeClick);

  if (hasFile) {
    return (
      <div className="flex items-center p-3 bg-brand-purple/5 rounded-lg border border-brand-purple/20 shadow-sm">
        <div className="mr-3 shrink-0">{icon}</div>
        <div className="overflow-hidden flex-1 min-w-0">
          {fileName && (
            <p className="text-xs font-bold text-slate-700 truncate" title={fileName}>
              {fileName}
            </p>
          )}
          <div className="text-[10px] text-slate-500 font-medium">{fileInfo}</div>
        </div>
        {shouldUseNative ? (
          <button
            onClick={handleNativeClick}
            className={cn(
              'p-1.5 hover:bg-slate-100 rounded text-slate-400 hover:text-brand-purple transition-all ml-1',
              disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
            )}
            title={t('upload.changeFile')}
            disabled={disabled}
          >
            <RefreshCcw className="w-3.5 h-3.5" />
          </button>
        ) : (
          <label
            className={cn(
              'cursor-pointer p-1.5 hover:bg-slate-100 rounded text-slate-400 hover:text-brand-purple transition-all ml-1',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
            title={t('upload.changeFile')}
          >
            <RefreshCcw className="w-3.5 h-3.5" />
            <input
              type="file"
              accept={accept}
              onChange={onFileSelect}
              className="hidden"
              disabled={disabled}
            />
          </label>
        )}
      </div>
    );
  }

  if (shouldUseNative) {
    return (
      <button
        onClick={handleNativeClick}
        disabled={disabled}
        className={cn(
          'flex flex-col items-center justify-center w-full border-2 border-dashed rounded-lg bg-slate-50 hover:bg-slate-100 cursor-pointer transition-all group',
          heightClass,
          disabled && 'opacity-50 cursor-not-allowed',
          error
            ? 'border-red-300 hover:border-red-400 bg-red-50'
            : 'border-slate-300 hover:border-brand-purple/50'
        )}
      >
        <div className="flex flex-col items-center justify-center py-4">
          <div className="mb-2 group-hover:scale-110 transition-transform">
            {React.isValidElement(icon)
              ? React.cloneElement(icon as React.ReactElement<any>, {
                  className: `w-8 h-8 ${(icon as React.ReactElement<any>).props.className || ''}`,
                })
              : icon}
          </div>
          <div className="text-xs font-bold text-slate-600 group-hover:text-slate-800 transition-colors">
            {uploadTitle}
          </div>
          {uploadDescription && (
            <div className="text-[10px] text-slate-500 mt-1">{uploadDescription}</div>
          )}
        </div>
      </button>
    );
  }

  return (
    <label
      className={cn(
        'flex flex-col items-center justify-center w-full border-2 border-dashed rounded-lg bg-slate-50 hover:bg-slate-100 cursor-pointer transition-all group',
        heightClass,
        disabled && 'opacity-50 cursor-not-allowed',
        error
          ? 'border-red-300 hover:border-red-400 bg-red-50'
          : 'border-slate-300 hover:border-brand-purple/50'
      )}
    >
      <div className="flex flex-col items-center justify-center py-4">
        <div className="mb-2 group-hover:scale-110 transition-transform">
          {/* We clone the icon to add specific classes if needed, or just render it */}
          {React.isValidElement(icon)
            ? React.cloneElement(icon as React.ReactElement<any>, {
                className: `w-8 h-8 ${(icon as React.ReactElement<any>).props.className || ''}`,
              })
            : icon}
        </div>
        <div className="text-xs font-bold text-slate-600 group-hover:text-slate-800 transition-colors">
          {uploadTitle}
        </div>
        {uploadDescription && (
          <div className="text-[10px] text-slate-500 mt-1">{uploadDescription}</div>
        )}
      </div>
      <input
        type="file"
        accept={accept}
        onChange={onFileSelect}
        className="hidden"
        disabled={disabled}
      />
    </label>
  );
};
