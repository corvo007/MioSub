import React from 'react';
import { FileVideo, FileText, Download, ArrowRight, Scissors } from 'lucide-react';
import { Header } from '@/components/layout/Header';

interface HomePageProps {
  onStartNew: () => void;
  onStartImport: () => void;
  onStartDownload: () => void;
  onShowLogs: () => void;
  onShowGlossary: () => void;
  onShowSettings: () => void;
  onStartCompression: () => void;
}

/**
 * Home page component with workflow visualization and tool sections
 */
export const HomePage: React.FC<HomePageProps> = ({
  onStartNew,
  onStartImport,
  onStartDownload,
  onShowLogs,
  onShowGlossary,
  onShowSettings,
  onStartCompression,
}) => {
  const isElectron = typeof window !== 'undefined' && !!window.electronAPI?.isElectron;

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col p-4 md:p-8">
      <div className="max-w-7xl mx-auto w-full flex-1 flex flex-col">
        <Header
          onShowLogs={onShowLogs}
          onShowGlossary={onShowGlossary}
          onShowSettings={onShowSettings}
        />
        <main className="flex-1 flex flex-col items-center justify-center max-w-4xl mx-auto w-full">
          {/* Workflow indicator */}
          <div className="w-full mb-10">
            <div className="flex items-center justify-center gap-3 text-sm text-slate-400">
              <span className="flex items-center gap-2 px-4 py-2 bg-slate-900/50 rounded-full border border-slate-800">
                <Download className="w-4 h-4 text-violet-400" />
                <span>下载视频</span>
              </span>
              <ArrowRight className="w-5 h-5 text-slate-700" />
              <span className="flex items-center gap-2 px-4 py-2 bg-slate-900/50 rounded-full border border-slate-800">
                <FileVideo className="w-4 h-4 text-indigo-400" />
                <span>生成字幕</span>
              </span>
              <ArrowRight className="w-5 h-5 text-slate-700" />
              <span className="flex items-center gap-2 px-4 py-2 bg-slate-900/50 rounded-full border border-slate-800">
                <FileText className="w-4 h-4 text-emerald-400" />
                <span>编辑润色</span>
              </span>
              <ArrowRight className="w-5 h-5 text-slate-700" />
              <span className="flex items-center gap-2 px-4 py-2 bg-slate-900/50 rounded-full border border-slate-800">
                <Scissors className="w-4 h-4 text-amber-400" />
                <span>压制导出</span>
              </span>
            </div>
            <p className="text-center text-slate-500 text-sm mt-4">
              支持视频下载、字幕生成、翻译润色、压制导出全流程
            </p>
          </div>

          {/* Subtitle Workspace Section */}
          <div className="w-full mb-6">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <span className="w-8 h-px bg-slate-800"></span>
              字幕工作台
              <span className="flex-1 h-px bg-slate-800"></span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={onStartNew}
                className="group relative bg-slate-900 border border-slate-800 hover:border-indigo-500/50 hover:bg-slate-800/50 rounded-2xl p-5 transition-all duration-300 flex items-center gap-4 text-left"
              >
                <div className="w-12 h-12 bg-slate-800 group-hover:bg-indigo-500/20 rounded-xl flex items-center justify-center shrink-0 transition-colors">
                  <FileVideo className="w-6 h-6 text-indigo-400 group-hover:scale-110 transition-transform" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white mb-0.5">新建项目</h2>
                  <p className="text-slate-500 text-sm">上传本地视频，生成字幕并翻译</p>
                </div>
              </button>
              <button
                onClick={onStartImport}
                className="group relative bg-slate-900 border border-slate-800 hover:border-emerald-500/50 hover:bg-slate-800/50 rounded-2xl p-5 transition-all duration-300 flex items-center gap-4 text-left"
              >
                <div className="w-12 h-12 bg-slate-800 group-hover:bg-emerald-500/20 rounded-xl flex items-center justify-center shrink-0 transition-colors">
                  <FileText className="w-6 h-6 text-emerald-400 group-hover:scale-110 transition-transform" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white mb-0.5">打开字幕</h2>
                  <p className="text-slate-500 text-sm">导入已有字幕文件，编辑或翻译</p>
                </div>
              </button>
            </div>
          </div>

          {/* Toolbox Section */}
          <div className="w-full">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <span className="w-8 h-px bg-slate-800"></span>
              工具箱
              <span className="flex-1 h-px bg-slate-800"></span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={isElectron ? onStartDownload : undefined}
                disabled={!isElectron}
                className={`group relative bg-slate-900 border border-slate-800 rounded-2xl p-5 transition-all duration-300 flex items-center gap-4 text-left
                                    ${
                                      isElectron
                                        ? 'hover:border-violet-500/50 hover:bg-slate-800/50 cursor-pointer'
                                        : 'opacity-50 cursor-not-allowed'
                                    }`}
              >
                <div
                  className={`w-12 h-12 bg-slate-800 rounded-xl flex items-center justify-center shrink-0 transition-colors
                                    ${isElectron ? 'group-hover:bg-violet-500/20' : ''}`}
                >
                  <Download
                    className={`w-6 h-6 text-violet-400 ${isElectron ? 'group-hover:scale-110' : ''} transition-transform`}
                  />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white mb-0.5">下载视频</h2>
                  <p className="text-slate-500 text-sm">从 YouTube / Bilibili 下载视频</p>
                </div>
              </button>
              <button
                onClick={isElectron ? onStartCompression : undefined}
                disabled={!isElectron}
                className={`group relative bg-slate-900 border border-slate-800 rounded-2xl p-5 transition-all duration-300 flex items-center gap-4 text-left
                                    ${
                                      isElectron
                                        ? 'hover:border-amber-500/50 hover:bg-slate-800/50 cursor-pointer'
                                        : 'opacity-50 cursor-not-allowed'
                                    }`}
              >
                <div
                  className={`w-12 h-12 bg-slate-800 rounded-xl flex items-center justify-center shrink-0 transition-colors
                                    ${isElectron ? 'group-hover:bg-amber-500/20' : ''}`}
                >
                  <Scissors
                    className={`w-6 h-6 text-amber-400 ${isElectron ? 'group-hover:scale-110' : ''} transition-transform`}
                  />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white mb-0.5">视频压制</h2>
                  <p className="text-slate-500 text-sm">将字幕嵌入视频并压缩导出</p>
                </div>
              </button>
            </div>
            {!isElectron && (
              <p className="text-center text-amber-500/80 text-sm mt-4">
                ⚠️ 以上功能在网页版不可用，请使用桌面版以获得最佳体验
              </p>
            )}
          </div>
        </main>
        <footer className="mt-12 text-center text-slate-600 text-sm">
          Gemini Subtitle Pro v{__APP_VERSION__}
        </footer>
      </div>
    </div>
  );
};
