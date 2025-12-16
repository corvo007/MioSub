import React from 'react';
import { FileVideo, FileText, Download, ArrowRight, Scissors, Wand2, Sparkles } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { cn } from '@/lib/cn';

interface HomePageProps {
  onStartNew: () => void;
  onStartImport: () => void;
  onStartDownload: () => void;
  onShowLogs: () => void;
  onShowGlossary: () => void;
  onShowSettings: () => void;
  onStartCompression: () => void;
  onStartEndToEnd?: () => void;
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
  onStartEndToEnd,
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

          {/* One-Click End-to-End Button */}
          {isElectron && onStartEndToEnd && (
            <div className="w-full mb-8">
              <button
                onClick={onStartEndToEnd}
                className="group w-full relative overflow-hidden bg-gradient-to-r from-violet-600 via-indigo-600 to-purple-600 hover:from-violet-500 hover:via-indigo-500 hover:to-purple-500 rounded-2xl p-6 transition-all duration-300 shadow-lg shadow-violet-500/20 hover:shadow-xl hover:shadow-violet-500/30 hover:-translate-y-0.5"
              >
                {/* Animated background pattern */}
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAwIDEwIEwgNDAgMTAgTSAxMCAwIEwgMTAgNDAgTSAwIDIwIEwgNDAgMjAgTSAyMCAwIEwgMjAgNDAgTSAwIDMwIEwgNDAgMzAgTSAzMCAwIEwgMzAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjA1IiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-50" />
                <div className="relative flex items-center justify-center gap-4">
                  <div className="w-14 h-14 bg-white/10 rounded-xl flex items-center justify-center backdrop-blur-sm">
                    <Wand2 className="w-7 h-7 text-white group-hover:rotate-12 transition-transform duration-300" />
                  </div>
                  <div className="text-left">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                      一键生成熟肉（全自动模式）
                      <Sparkles className="w-5 h-5 text-amber-300 animate-pulse" />
                    </h2>
                    <p className="text-white/70 text-sm">输入链接，自动下载、生成字幕、压制视频</p>
                  </div>
                  <ArrowRight className="w-6 h-6 text-white/50 group-hover:text-white group-hover:translate-x-1 transition-all ml-auto" />
                </div>
              </button>
            </div>
          )}

          {/* Subtitle Workspace Section */}
          <div className="w-full mb-6">
            <SectionHeader withDivider className="mb-4">
              字幕工作台
            </SectionHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6">
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
            <SectionHeader withDivider className="mb-4">
              工具箱
            </SectionHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6">
              <button
                onClick={isElectron ? onStartDownload : undefined}
                disabled={!isElectron}
                className={cn(
                  'group relative bg-slate-900 border border-slate-800 rounded-2xl p-5 transition-all duration-300 flex items-center gap-4 text-left',
                  isElectron
                    ? 'hover:border-violet-500/50 hover:bg-slate-800/50 cursor-pointer'
                    : 'opacity-50 cursor-not-allowed'
                )}
              >
                <div
                  className={cn(
                    'w-12 h-12 bg-slate-800 rounded-xl flex items-center justify-center shrink-0 transition-colors',
                    isElectron && 'group-hover:bg-violet-500/20'
                  )}
                >
                  <Download
                    className={cn(
                      'w-6 h-6 text-violet-400 transition-transform',
                      isElectron && 'group-hover:scale-110'
                    )}
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
                className={cn(
                  'group relative bg-slate-900 border border-slate-800 rounded-2xl p-5 transition-all duration-300 flex items-center gap-4 text-left',
                  isElectron
                    ? 'hover:border-amber-500/50 hover:bg-slate-800/50 cursor-pointer'
                    : 'opacity-50 cursor-not-allowed'
                )}
              >
                <div
                  className={cn(
                    'w-12 h-12 bg-slate-800 rounded-xl flex items-center justify-center shrink-0 transition-colors',
                    isElectron && 'group-hover:bg-amber-500/20'
                  )}
                >
                  <Scissors
                    className={cn(
                      'w-6 h-6 text-amber-400 transition-transform',
                      isElectron && 'group-hover:scale-110'
                    )}
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
                ⚠️ 以上功能及全自动模式在网页版不可用，请使用桌面版以获得最佳体验
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
