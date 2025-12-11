import React from 'react';
import { RefreshCcw } from 'lucide-react';

interface FileUploaderProps {
  hasFile: boolean;
  fileName?: string;
  fileInfo?: React.ReactNode;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onFileSelectNative?: (file: File) => void; // Callback for native dialog (receives File with path)
  onNativeClick?: () => void; // Generic callback for native dialog click (no File returned)
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
  disabled = false,
  accept,
  icon,
  uploadTitle,
  uploadDescription,
  heightClass = 'h-32',
  error = false,
  useNativeDialog = false,
}) => {
  // Handle click for native dialog
  const handleNativeClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

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
        // Read file buffer and create File object with path attached
        const buffer = await window.electronAPI.readLocalFile(result.filePath);
        const file = new File([buffer], result.fileName, {
          type: result.type || 'application/octet-stream',
        });

        // Attach path to file for Electron/FFmpeg usage
        Object.defineProperty(file, 'path', {
          value: result.filePath,
          writable: false,
          enumerable: false,
          configurable: false,
        });

        onFileSelectNative(file);
      }
    } catch (err) {
      console.error('Failed to select media file:', err);
    }
  };

  const isElectron = !!window.electronAPI?.isElectron;
  const shouldUseNative = useNativeDialog && isElectron && (onFileSelectNative || onNativeClick);

  if (hasFile) {
    return (
      <div className="flex items-center p-3 bg-slate-800 rounded-lg border border-slate-700/50">
        <div className="mr-3 flex-shrink-0">{icon}</div>
        <div className="overflow-hidden flex-1 min-w-0">
          {fileName && (
            <p className="text-xs font-medium text-white truncate" title={fileName}>
              {fileName}
            </p>
          )}
          <div className="text-[10px] text-slate-500">{fileInfo}</div>
        </div>
        {shouldUseNative ? (
          <button
            onClick={handleNativeClick}
            className={`p-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors ml-1 ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            title="更改文件"
            disabled={disabled}
          >
            <RefreshCcw className="w-3 h-3" />
          </button>
        ) : (
          <label
            className={`cursor-pointer p-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors ml-1 ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            title="更改文件"
          >
            <RefreshCcw className="w-3 h-3" />
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
        className={`flex flex-col items-center justify-center w-full border-2 border-dashed rounded-lg bg-slate-800/30 hover:bg-slate-800/50 cursor-pointer transition-all group ${heightClass} ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${error ? 'border-red-500/50 hover:border-red-500' : 'border-slate-700 hover:border-indigo-500/50'}`}
      >
        <div className="flex flex-col items-center justify-center py-4">
          <div className="mb-2 group-hover:scale-110 transition-transform">
            {React.isValidElement(icon)
              ? React.cloneElement(icon as React.ReactElement<any>, {
                  className: `w-8 h-8 ${(icon as React.ReactElement<any>).props.className || ''}`,
                })
              : icon}
          </div>
          <div className="text-xs font-bold text-slate-300">{uploadTitle}</div>
          {uploadDescription && (
            <div className="text-[10px] text-slate-500 mt-1">{uploadDescription}</div>
          )}
        </div>
      </button>
    );
  }

  return (
    <label
      className={`flex flex-col items-center justify-center w-full border-2 border-dashed rounded-lg bg-slate-800/30 hover:bg-slate-800/50 cursor-pointer transition-all group ${heightClass} ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${error ? 'border-red-500/50 hover:border-red-500' : 'border-slate-700 hover:border-indigo-500/50'}`}
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
        <div className="text-xs font-bold text-slate-300">{uploadTitle}</div>
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
