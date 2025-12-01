import React from 'react';
import { Upload, RefreshCcw, Plus } from 'lucide-react';

interface FileUploaderProps {
    hasFile: boolean;
    fileName?: string;
    fileInfo?: React.ReactNode;
    onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
    disabled?: boolean;
    accept: string;
    icon: React.ReactNode;
    uploadTitle: React.ReactNode;
    uploadDescription?: React.ReactNode;
    heightClass?: string;
    activeTab?: string;
    error?: boolean;
}

export const FileUploader: React.FC<FileUploaderProps> = ({
    hasFile,
    fileName,
    fileInfo,
    onFileSelect,
    disabled = false,
    accept,
    icon,
    uploadTitle,
    uploadDescription,
    heightClass = 'h-32',
    error = false
}) => {
    if (hasFile) {
        return (
            <div className="flex items-center p-3 bg-slate-800 rounded-lg border border-slate-700/50">
                <div className="mr-3 flex-shrink-0">
                    {icon}
                </div>
                <div className="overflow-hidden flex-1 min-w-0">
                    {fileName && (
                        <p className="text-xs font-medium text-white truncate" title={fileName}>
                            {fileName}
                        </p>
                    )}
                    <div className="text-[10px] text-slate-500">
                        {fileInfo}
                    </div>
                </div>
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
            </div>
        );
    }

    return (
        <label
            className={`flex flex-col items-center justify-center w-full border-2 border-dashed rounded-lg bg-slate-800/30 hover:bg-slate-800/50 cursor-pointer transition-all group ${heightClass} ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${error ? 'border-red-500/50 hover:border-red-500' : 'border-slate-700 hover:border-indigo-500/50'}`}
        >
            <div className="flex flex-col items-center justify-center py-4">
                <div className="mb-2 group-hover:scale-110 transition-transform">
                    {/* We clone the icon to add specific classes if needed, or just render it */}
                    {React.cloneElement(icon as React.ReactElement, {
                        className: `w-8 h-8 ${(icon as React.ReactElement).props.className || ''}`
                    })}
                </div>
                <div className="text-xs font-bold text-slate-300">
                    {uploadTitle}
                </div>
                {uploadDescription && (
                    <div className="text-[10px] text-slate-500 mt-1">
                        {uploadDescription}
                    </div>
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
