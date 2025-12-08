import React from 'react';
import { Info, X, Heart, Github } from 'lucide-react';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
  version?: string;
}

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose, version = '2.7.2' }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-0 max-w-md w-full shadow-2xl transform transition-all scale-100 overflow-hidden">
        {/* Header with gradient */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-6 flex items-start justify-between">
          <div className="flex items-center space-x-3 text-white">
            <div className="bg-white/20 p-2 rounded-xl backdrop-blur-sm">
              <Info className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Gemini Subtitle Pro</h2>
              <p className="text-white/80 text-xs mt-0.5">智能字幕生成与翻译工具</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/70 hover:text-white transition-colors bg-white/10 hover:bg-white/20 rounded-lg p-1.5"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
              <span className="text-slate-400 text-sm">当前版本</span>
              <span className="text-indigo-400 font-mono font-bold">v{version}</span>
            </div>

            <p className="text-slate-300 text-sm leading-relaxed text-center">
              基于 Google Gemini API 与 Local Whisper 模型，
              <br />
              为您提供快速、准确的视频字幕生成与翻译体验。
            </p>
          </div>

          <div className="flex items-center justify-center space-x-4 pt-4 border-t border-slate-800/50">
            <a
              href="https://github.com/Start-to-DJ/Gemini-Subtitle-Pro"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-2 text-slate-400 hover:text-white transition-colors text-sm px-4 py-2 rounded-lg hover:bg-slate-800"
            >
              <Github className="w-4 h-4" />
              <span>GitHub</span>
            </a>
            <div className="flex items-center space-x-2 text-slate-400 text-sm px-4 py-2 cursor-default">
              <Heart className="w-4 h-4 text-rose-500 fill-rose-500/20" />
              <span>Made by Corvo</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
