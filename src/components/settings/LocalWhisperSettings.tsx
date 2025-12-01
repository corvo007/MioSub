import React, { useEffect, useState } from 'react';
import { logger } from '@/services/utils/logger';

interface LocalWhisperSettingsProps {
    useLocalWhisper: boolean;
    whisperModelPath?: string;
    onToggle: (enabled: boolean) => void;
    onModelPathChange: (path: string) => void;
}

export const LocalWhisperSettings: React.FC<LocalWhisperSettingsProps> = ({
    useLocalWhisper,
    whisperModelPath,
    onToggle,
    onModelPathChange
}) => {
    // Select model
    const handleSelect = async () => {
        if (!window.electronAPI) {
            console.error('[LocalWhisperSettings] electronAPI not available for selection');
            return;
        }
        console.log('[LocalWhisperSettings] Requesting model selection...');
        try {
            const path = await window.electronAPI.selectWhisperModel();
            console.log('[LocalWhisperSettings] Model selected:', path);
            if (path) onModelPathChange(path);
        } catch (error: any) {
            logger.error('[LocalWhisperSettings] Model selection failed', error);
        }
    };

    return (
        <div className="space-y-4 p-4 border border-slate-700 rounded-lg bg-slate-800/50">
            <div className="space-y-1">
                <h3 className="text-sm font-medium text-slate-200">模型文件路径</h3>
                <p className="text-xs text-slate-500">使用本地 Whisper 模型（GGML 格式）进行语音转录，完全离线运行。</p>
            </div>

            <div className="flex gap-2">
                <input
                    type="text"
                    value={whisperModelPath || ''}
                    placeholder="选择模型文件..."
                    readOnly
                    className="flex-1 px-3 py-2 border border-slate-700 rounded bg-slate-900 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
                <button onClick={handleSelect} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded transition-colors">
                    📁 浏览
                </button>
            </div>

            <div className="text-xs text-slate-400 bg-slate-900/50 p-2 rounded border border-slate-700/50">
                <p className="font-medium mb-1 text-slate-300">💡 说明：</p>
                <ul className="list-disc list-inside space-y-1">
                    <li>需要 <strong>GGML 格式</strong> 的 .bin 模型文件</li>
                    <li>仅支持 <a href="https://huggingface.co/ggerganov/whisper.cpp" target="_blank" className="text-blue-400 underline hover:text-blue-300">whisper.cpp 官方模型</a>，不支持 Faster-whisper 模型。</li>
                </ul>
            </div>
        </div>
    );
};
