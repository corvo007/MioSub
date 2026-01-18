import React from 'react';
import { useTranslation } from 'react-i18next';
import { FileVideo, FileText, Download, ArrowRight, Scissors, Wand2 } from 'lucide-react';
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
  const { t } = useTranslation('home');
  const isElectron = typeof window !== 'undefined' && !!window.electronAPI?.isElectron;

  return (
    <div className="min-h-screen-safe bg-warm-mesh flex flex-col p-4 md:p-8">
      <div className="max-w-7xl mx-auto w-full flex-1 flex flex-col">
        <Header
          onShowLogs={onShowLogs}
          onShowGlossary={onShowGlossary}
          onShowSettings={onShowSettings}
        />
        <main className="flex-1 flex flex-col items-center justify-center max-w-5xl mx-auto w-full">
          {/* Workflow indicator */}
          <div className="w-full mb-10 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:pb-0 hide-scrollbar">
            <div className="flex items-center justify-center min-w-max sm:min-w-0 gap-3 text-sm text-slate-500 font-medium">
              <span className="flex items-center gap-2 px-4 py-2 bg-white/80 backdrop-blur-md rounded-full border border-white/50 shadow-sm text-slate-700 ring-1 ring-slate-900/5">
                <Download className="w-4 h-4 text-brand-purple" />
                <span>{t('workflow.download')}</span>
              </span>
              <ArrowRight className="w-5 h-5 text-brand-purple/20" />
              <span className="flex items-center gap-2 px-4 py-2 bg-white/80 backdrop-blur-md rounded-full border border-white/50 shadow-sm text-slate-700 ring-1 ring-slate-900/5">
                <FileVideo className="w-4 h-4 text-brand-purple" />
                <span>{t('workflow.generate')}</span>
              </span>
              <ArrowRight className="w-5 h-5 text-brand-purple/20" />
              <span className="flex items-center gap-2 px-4 py-2 bg-white/80 backdrop-blur-md rounded-full border border-white/50 shadow-sm text-slate-700 ring-1 ring-slate-900/5">
                <FileText className="w-4 h-4 text-brand-orange" />
                <span>{t('workflow.edit')}</span>
              </span>
              <ArrowRight className="w-5 h-5 text-brand-purple/20" />
              <span className="flex items-center gap-2 px-4 py-2 bg-white/80 backdrop-blur-md rounded-full border border-white/50 shadow-sm text-slate-700 ring-1 ring-slate-900/5">
                <Scissors className="w-4 h-4 text-brand-orange" />
                <span>{t('workflow.export')}</span>
              </span>
            </div>
            <p className="text-center text-slate-500 text-sm mt-6 font-medium tracking-wide opacity-80">
              {t('description')}
            </p>
          </div>

          {/* One-Click End-to-End Button */}
          {isElectron && onStartEndToEnd && (
            <div className="w-full mb-8">
              <button
                onClick={onStartEndToEnd}
                className="group w-full relative overflow-hidden bg-linear-to-r from-brand-purple to-brand-orange hover:brightness-105 rounded-2xl p-6 transition-all duration-300 shadow-xl shadow-brand-purple/20 hover:shadow-2xl hover:shadow-brand-purple/30 hover:-translate-y-0.5 isolation-isolate transform-gpu"
              >
                {/* Animated background pattern */}
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAwIDEwIEwgNDAgMTAgTSAxMCAwIEwgMTAgNDAgTSAwIDIwIEwgNDAgMjAgTSAyMCAwIEwgMjAgNDAgTSAwIDMwIEwgNDAgMzAgTSAzMCAwIEwgMzAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjA1IiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-20 mix-blend-overlay" />

                {/* Shine effect */}
                <div className="absolute inset-0 bg-linear-to-r from-transparent via-white/10 to-transparent skew-x-12 translate-x-[-150%] group-hover:translate-x-[150%] transition-transform duration-1000 ease-in-out" />

                <div className="relative flex items-center justify-center gap-4">
                  <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-xl shadow-inner border border-white/20 group-hover:bg-white/25 transition-colors">
                    <Wand2 className="w-7 h-7 text-white group-hover:rotate-12 transition-transform duration-500 ease-spring" />
                  </div>
                  <div className="text-left flex-1 min-w-0">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                      {t('endToEnd.title')}
                      <div className="px-2 py-0.5 rounded-full bg-white/20 text-xs font-bold border border-white/20 backdrop-blur-md">
                        BETA
                      </div>
                    </h2>
                    <p className="text-white/90 text-sm font-medium mt-1 text-shadow-sm">
                      {t('endToEnd.description')}
                    </p>
                  </div>
                  <ArrowRight className="w-6 h-6 text-white group-hover:translate-x-1 transition-transform ml-auto" />
                </div>
              </button>
            </div>
          )}

          {/* Subtitle Workspace Section */}
          <div className="w-full mb-6">
            <SectionHeader withDivider className="mb-4 text-slate-800 font-bold tracking-tight">
              {t('sections.workspace')}
            </SectionHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6">
              <button
                onClick={onStartNew}
                className="w-full group relative bg-white/80 backdrop-blur-md border border-white/60 hover:border-brand-purple/30 hover:shadow-lg rounded-2xl p-5 transition-all duration-300 flex items-center gap-4 text-left shadow-sm ring-1 ring-slate-900/5 group"
              >
                <div className="w-12 h-12 bg-brand-purple/10 border border-brand-purple/10 group-hover:scale-110 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-300">
                  <FileVideo className="w-6 h-6 text-brand-purple" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-slate-800 mb-0.5 group-hover:text-brand-purple transition-colors">
                    {t('cards.newProject.title')}
                  </h2>
                  <p className="text-slate-500 text-sm truncate">
                    {t('cards.newProject.description')}
                  </p>
                </div>
              </button>
              <button
                onClick={onStartImport}
                className="w-full group relative bg-white/80 backdrop-blur-md border border-white/60 hover:border-brand-purple/30 hover:shadow-lg rounded-2xl p-5 transition-all duration-300 flex items-center gap-4 text-left shadow-sm ring-1 ring-slate-900/5 group"
              >
                <div className="w-12 h-12 bg-indigo-50 border border-indigo-100 group-hover:scale-110 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-300">
                  <FileText className="w-6 h-6 text-indigo-500" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-slate-800 mb-0.5 group-hover:text-indigo-600 transition-colors">
                    {t('cards.openSubtitle.title')}
                  </h2>
                  <p className="text-slate-500 text-sm truncate">
                    {t('cards.openSubtitle.description')}
                  </p>
                </div>
              </button>
            </div>
          </div>

          {/* Toolbox Section */}
          <div className="w-full">
            <SectionHeader withDivider className="mb-4 text-slate-800 font-bold tracking-tight">
              {t('sections.toolbox')}
            </SectionHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6">
              <button
                onClick={isElectron ? onStartDownload : undefined}
                disabled={!isElectron}
                className={cn(
                  'w-full group relative bg-white/80 backdrop-blur-md border border-white/60 rounded-2xl p-5 transition-all duration-300 flex items-center gap-4 text-left shadow-sm ring-1 ring-slate-900/5',
                  isElectron
                    ? 'hover:border-brand-purple/30 hover:shadow-lg cursor-pointer'
                    : 'opacity-60 cursor-not-allowed'
                )}
              >
                <div
                  className={cn(
                    'w-12 h-12 bg-blue-50 border border-blue-100 rounded-xl flex items-center justify-center shrink-0 transition-colors',
                    isElectron && 'group-hover:rotate-6 transition-transform'
                  )}
                >
                  <Download className={cn('w-6 h-6 text-blue-500')} />
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-slate-800 mb-0.5 group-hover:text-blue-600 transition-colors">
                    {t('cards.download.title')}
                  </h2>
                  <p className="text-slate-500 text-sm truncate">
                    {t('cards.download.description')}
                  </p>
                </div>
              </button>
              <button
                onClick={isElectron ? onStartCompression : undefined}
                disabled={!isElectron}
                className={cn(
                  'w-full group relative bg-white/80 backdrop-blur-md border border-white/60 rounded-2xl p-5 transition-all duration-300 flex items-center gap-4 text-left shadow-sm ring-1 ring-slate-900/5',
                  isElectron
                    ? 'hover:border-brand-purple/30 hover:shadow-lg cursor-pointer'
                    : 'opacity-60 cursor-not-allowed'
                )}
              >
                <div
                  className={cn(
                    'w-12 h-12 bg-orange-50 border border-orange-100 rounded-xl flex items-center justify-center shrink-0 transition-colors',
                    isElectron && 'group-hover:rotate-6 transition-transform'
                  )}
                >
                  <Scissors className={cn('w-6 h-6 text-brand-orange')} />
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-slate-800 mb-0.5 group-hover:text-brand-orange transition-colors">
                    {t('cards.compression.title')}
                  </h2>
                  <p className="text-slate-500 text-sm truncate">
                    {t('cards.compression.description')}
                  </p>
                </div>
              </button>
            </div>
            {!isElectron && (
              <p className="text-center text-amber-600/80 text-sm mt-4 font-medium">
                {t('webWarning')}
              </p>
            )}
          </div>
        </main>
        <footer className="mt-12 text-center text-slate-400 text-sm font-medium">
          MioSub v{__APP_VERSION__}
        </footer>
      </div>
    </div>
  );
};
