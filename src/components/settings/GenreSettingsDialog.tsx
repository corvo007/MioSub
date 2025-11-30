import React, { useState, useEffect } from 'react';
import { Clapperboard, X } from 'lucide-react';
import { GENRE_PRESETS } from '@/types/settings';

interface GenreSettingsDialogProps {
    isOpen: boolean;
    onClose: () => void;
    currentGenre: string;
    onSave: (genre: string) => void;
}

export const GenreSettingsDialog: React.FC<GenreSettingsDialogProps> = ({ isOpen, onClose, currentGenre, onSave }) => {
    const [tempGenre, setTempGenre] = useState(currentGenre);
    const [customInput, setCustomInput] = useState('');

    useEffect(() => {
        if (isOpen) {
            if (GENRE_PRESETS.includes(currentGenre)) {
                setTempGenre(currentGenre);
                setCustomInput('');
            } else {
                setTempGenre('custom');
                setCustomInput(currentGenre);
            }
        }
    }, [isOpen, currentGenre]);

    const handleSave = () => {
        onSave(tempGenre === 'custom' ? customInput : tempGenre);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-md w-full shadow-2xl">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-bold text-white flex items-center"><Clapperboard className="w-5 h-5 mr-2 text-indigo-400" /> 类型 / 上下文设置</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
                </div>
                <div className="space-y-4 mb-6">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">选择预设</label>
                        <div className="grid grid-cols-2 gap-2">
                            {GENRE_PRESETS.map(g => (
                                <button key={g} onClick={() => setTempGenre(g)} className={`px-3 py-2 rounded-lg text-sm border transition-all ${tempGenre === g ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'}`}>{g === 'general' ? '通用' : g === 'anime' ? '动漫' : g === 'movie' ? '电影/剧集' : g === 'news' ? '新闻' : g === 'tech' ? '科技' : g}</button>
                            ))}
                            <button onClick={() => setTempGenre('custom')} className={`px-3 py-2 rounded-lg text-sm border transition-all ${tempGenre === 'custom' ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'}`}>自定义...</button>
                        </div>
                    </div>
                    {tempGenre === 'custom' && (
                        <div className="animate-fade-in">
                            <label className="block text-sm font-medium text-slate-300 mb-2">自定义上下文</label>
                            <input type="text" value={customInput} onChange={(e) => setCustomInput(e.target.value)} placeholder="例如：Minecraft 游戏视频，医学讲座..." className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-slate-200 focus:outline-none focus:border-indigo-500 text-sm" autoFocus />
                        </div>
                    )}
                </div>
                <div className="flex justify-end">
                    <button onClick={handleSave} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium shadow-lg shadow-indigo-500/20 transition-colors">保存更改</button>
                </div>
            </div>
        </div>
    );
};
