import React from 'react';
import { useTranslation } from 'react-i18next';
import { Settings, X } from 'lucide-react';
import { type AppSettings } from '@/types/settings';
import { cn } from '@/lib/cn';
import { GeneralTab, ServicesTab, PerformanceTab, EnhanceTab, DebugTab, AboutTab } from './tabs';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  updateSetting: (key: keyof AppSettings, value: any) => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  envGeminiKey: string;
  envOpenaiKey: string;
  onOpenGlossaryManager: () => void;
  addToast: (message: string, type: 'info' | 'warning' | 'error' | 'success') => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  updateSetting,
  activeTab,
  setActiveTab,
  envGeminiKey,
  envOpenaiKey,
  onOpenGlossaryManager,
  addToast,
}) => {
  const { t } = useTranslation('settings');

  if (!isOpen) return null;

  // Common props for tabs that need settings access
  const tabProps = { settings, updateSetting };

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div
        className="bg-white/90 backdrop-blur-xl border border-white/50 rounded-2xl w-full max-w-3xl flex flex-col shadow-2xl shadow-brand-purple/10 animate-in zoom-in-95 duration-200 relative overflow-hidden"
        style={{ maxHeight: 'calc(var(--app-height-safe, 100vh) * 0.9)' }}
      >
        <div className="p-6 overflow-y-auto custom-scrollbar">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 transition-colors bg-white/50 hover:bg-white rounded-full p-1"
          >
            <X className="w-5 h-5" />
          </button>
          <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center">
            <Settings className="w-5 h-5 mr-2 text-brand-purple" /> {t('title')}
          </h2>

          {/* Tab Navigation */}
          <div className="flex space-x-1 p-1 bg-slate-200/80 rounded-xl mb-6 overflow-x-auto">
            {[
              'general',
              'services',
              'performance',
              'enhance',
              'about',
              ...(window.electronAPI?.isDebug ? ['debug'] : []),
            ].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'px-4 py-2 text-sm font-medium rounded-lg transition-all whitespace-nowrap flex-1',
                  activeTab === tab
                    ? 'bg-white text-brand-purple shadow-sm ring-1 ring-black/5 font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                )}
              >
                {t(`tabs.${tab}`)}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="space-y-6 min-h-100">
            {activeTab === 'general' && <GeneralTab {...tabProps} />}

            {activeTab === 'services' && (
              <ServicesTab
                {...tabProps}
                envGeminiKey={envGeminiKey}
                envOpenaiKey={envOpenaiKey}
                addToast={addToast}
              />
            )}

            {activeTab === 'performance' && <PerformanceTab {...tabProps} />}

            {activeTab === 'enhance' && (
              <EnhanceTab
                {...tabProps}
                onOpenGlossaryManager={onOpenGlossaryManager}
                addToast={addToast}
                onClose={onClose}
              />
            )}

            {activeTab === 'about' && <AboutTab />}

            {activeTab === 'debug' && <DebugTab {...tabProps} />}
          </div>
        </div>
      </div>
    </div>
  );
};
