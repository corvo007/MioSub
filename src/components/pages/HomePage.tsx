import React from 'react';
import { FileVideo, FileText } from 'lucide-react';
import { Header } from '@/components/layout/Header';

interface HomePageProps {
    onStartNew: () => void;
    onStartImport: () => void;
    onShowLogs: () => void;
    onShowGlossary: () => void;
    onShowSettings: () => void;
}

/**
 * Home page component with project type selection
 */
export const HomePage: React.FC<HomePageProps> = ({
    onStartNew,
    onStartImport,
    onShowLogs,
    onShowGlossary,
    onShowSettings
}) => {
    return (
        <div className="min-h-screen bg-slate-950 flex flex-col p-4 md:p-8">
            <div className="max-w-7xl mx-auto w-full flex-1 flex flex-col">
                <Header
                    onShowLogs={onShowLogs}
                    onShowGlossary={onShowGlossary}
                    onShowSettings={onShowSettings}
                />
                <main className="flex-1 flex flex-col items-center justify-center max-w-4xl mx-auto w-full">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full">
                        <button onClick={onStartNew} className="group relative bg-slate-900 border border-slate-800 hover:border-indigo-500/50 hover:bg-slate-800/50 rounded-3xl p-8 transition-all duration-300 shadow-2xl flex flex-col items-center text-center cursor-pointer">
                            <div className="w-20 h-20 bg-slate-800 group-hover:bg-indigo-500/20 rounded-2xl flex items-center justify-center mb-6 transition-colors"><FileVideo className="w-10 h-10 text-indigo-400 group-hover:scale-110 transition-transform" /></div>
                            <h2 className="text-2xl font-bold text-white mb-3">新建项目</h2><p className="text-slate-400 leading-relaxed">使用 Whisper 识别语音，通过 Gemini AI 翻译字幕。</p>
                        </button>
                        <button onClick={onStartImport} className="group relative bg-slate-900 border border-slate-800 hover:border-emerald-500/50 hover:bg-slate-800/50 rounded-3xl p-8 transition-all duration-300 shadow-2xl flex flex-col items-center text-center cursor-pointer">
                            <div className="w-20 h-20 bg-slate-800 group-hover:bg-emerald-500/20 rounded-2xl flex items-center justify-center mb-6 transition-colors"><FileText className="w-10 h-10 text-emerald-400 group-hover:scale-110 transition-transform" /></div>
                            <h2 className="text-2xl font-bold text-white mb-3">打开字幕</h2><p className="text-slate-400 leading-relaxed mb-4">导入现有字幕文件，优化时间轴、校对译文或重新翻译。</p>
                            <div className="flex flex-wrap gap-2 justify-center mt-2"><span className="text-xs px-2 py-1 bg-slate-800 rounded border border-slate-700 text-slate-500">编辑文本</span><span className="text-xs px-2 py-1 bg-slate-800 rounded border border-slate-700 text-slate-500">+ 视频参考</span></div>
                        </button>
                    </div>
                </main>
                <footer className="mt-12 text-center text-slate-600 text-sm">Gemini Subtitle Pro v{__APP_VERSION__}</footer>
            </div>
        </div>
    );
};
