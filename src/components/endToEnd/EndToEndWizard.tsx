/**
 * End-to-End Wizard Component
 * 全屏向导组件，引导用户完成端到端字幕生成流程
 */

import React from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Link2,
  Settings,
  Play,
  CheckCircle,
  FileText,
  Book,
  AlertCircle,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useEndToEnd } from '@/hooks/useEndToEnd';
import { EndToEndProgress } from '@/components/endToEnd/EndToEndProgress';
import type { AppSettings } from '@/types/settings';
import { StepIndicator } from '@/components/endToEnd/wizard/shared/StepIndicator';
import { StepInput } from '@/components/endToEnd/wizard/steps/StepInput';
import { StepConfig } from '@/components/endToEnd/wizard/steps/StepConfig';
import { StepResult } from '@/components/endToEnd/wizard/steps/StepResult';
import { PageHeader, HeaderButton } from '@/components/layout/PageHeader';
import { HelpButton } from '@/components/layout/HelpButton';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { PreflightErrorModal } from '@/components/modals/PreflightErrorModal';
import { useAppStore } from '@/store/useAppStore';

interface EndToEndWizardProps {
  settings: AppSettings;
  onComplete?: () => void;
  onCancel: () => void;
}

/** 主向导组件*/
export function EndToEndWizard({ settings, onComplete, onCancel }: EndToEndWizardProps) {
  // Store actions
  const setShowLogs = useAppStore((s) => s.setShowLogs);
  const setShowGlossaryManager = useAppStore((s) => s.setShowGlossaryManager);
  const setShowSettings = useAppStore((s) => s.setShowSettings);
  const setSettingsTab = useAppStore((s) => s.setSettingsTab);

  const {
    state,
    preflightErrors,
    clearPreflightErrors,
    goNext,
    goBack,
    updateConfig,
    resetConfig,
    retryPipeline,
    parseUrl,
    videoInfo,
    startPipeline,
    abortPipeline,
    isElectron,
  } = useEndToEnd();
  const { t } = useTranslation('endToEnd');

  const steps = [
    { label: t('wizard.steps.input'), icon: <Link2 className="w-4 h-4" /> },
    { label: t('wizard.steps.config'), icon: <Settings className="w-4 h-4" /> },
    { label: t('wizard.steps.process'), icon: <Play className="w-4 h-4" /> },
    { label: t('wizard.steps.complete'), icon: <CheckCircle className="w-4 h-4" /> },
  ];

  const currentStepIndex = ['input', 'config', 'progress', 'result'].indexOf(state.currentStep);

  // Check if can proceed to next step
  const canProceed = () => {
    if (state.currentStep === 'input') {
      return !!videoInfo;
    }
    if (state.currentStep === 'config') {
      if (!state.config.outputDir || !state.config.targetLanguage) {
        return false;
      }
      return true;
    }
    return false;
  };

  const handleNext = async () => {
    if (state.currentStep === 'config') {
      // Start pipeline, passing global settings to ensure user preferences (like diarization) are respected
      await startPipeline(settings);
    } else {
      goNext();
    }
  };

  const handleParseUrl = async (url?: string) => {
    const urlToUse = url || state.config.url;
    if (urlToUse) {
      await parseUrl(urlToUse);
    }
  };

  if (!isElectron) {
    return (
      <div className="min-h-screen bg-warm-mesh flex items-center justify-center p-8">
        <div className="text-center bg-white/50 backdrop-blur-xl p-8 rounded-2xl border border-white/40 shadow-xl">
          <AlertCircle className="w-16 h-16 text-amber-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-slate-800 mb-2">
            {t('wizard.featureUnavailable.title')}
          </h2>
          <p className="text-slate-500 mb-6">{t('wizard.featureUnavailable.desc')}</p>
          <button
            onClick={onCancel}
            className="px-6 py-3 bg-white border border-slate-200 rounded-xl text-slate-700 hover:bg-slate-50 transition-all font-medium shadow-sm hover:shadow-md"
          >
            {t('wizard.featureUnavailable.return')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden bg-warm-mesh flex flex-col p-4 md:p-8">
      <div className="max-w-7xl mx-auto w-full flex-1 flex flex-col min-h-0">
        {/* Header */}
        <PageHeader
          title={
            <>
              <span className="truncate text-slate-800">{t('wizard.title')}</span>
              <span className="text-[10px] sm:text-xs font-normal text-brand-purple bg-brand-purple/5 border border-brand-purple/10 px-1.5 sm:px-2 py-0.5 rounded whitespace-nowrap">
                {t('wizard.modeBadge')}
              </span>
            </>
          }
          subtitle={t('wizard.subtitle')}
          onBack={onCancel}
          actions={
            <>
              <HeaderButton
                onClick={() => setShowLogs(true)}
                icon={<FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                label={t('wizard.header.logs')}
                title={t('wizard.header.viewLogs')}
                hoverColor="blue"
              />
              <HeaderButton
                onClick={() => setShowGlossaryManager(true)}
                icon={<Book className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                label={t('wizard.header.glossary')}
                title={t('wizard.header.manageGlossary')}
                hoverColor="indigo"
              />
              <HeaderButton
                onClick={() => setShowSettings(true)}
                icon={<Settings className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                label={t('wizard.header.settings')}
                hoverColor="emerald"
              />
              <HelpButton />
            </>
          }
        />

        {/* Step Indicator */}
        <div className="pt-8">
          <StepIndicator currentStep={currentStepIndex} steps={steps} />
        </div>

        {/* Content */}
        <div className="flex-1 py-8 overflow-y-auto">
          {state.currentStep === 'input' && (
            <StepInput
              url={state.config.url || ''}
              onUrlChange={(url) => updateConfig({ url })}
              onParse={handleParseUrl}
              isParsing={state.isParsing}
              parseError={state.parseError}
              videoInfo={videoInfo}
            />
          )}
          {state.currentStep === 'config' && (
            <StepConfig
              config={state.config}
              onConfigChange={updateConfig}
              videoInfo={videoInfo}
              settings={settings}
            />
          )}
          {state.currentStep === 'progress' && (
            <EndToEndProgress
              progress={state.progress}
              onAbort={abortPipeline}
              onRetry={retryPipeline}
            />
          )}
          {state.currentStep === 'result' && (
            <StepResult
              result={state.result}
              onReset={resetConfig}
              onClose={onComplete || onCancel}
            />
          )}
        </div>

        {/* Footer Navigation - 仅在配置页显示，输入页解析成功后自动跳转 */}
        {state.currentStep === 'config' && (
          <footer className="py-5 border-t border-purple-200/30 shrink-0 backdrop-blur-sm">
            <div className="max-w-3xl mx-auto flex justify-between px-6">
              <button
                onClick={currentStepIndex > 0 ? goBack : onCancel}
                className="px-6 py-3 bg-white border border-slate-200 rounded-xl text-slate-600 font-medium transition-colors hover:bg-slate-50 hover:text-slate-900 shadow-sm"
              >
                <span className="flex items-center gap-2">
                  <ArrowLeft className="w-4 h-4" />
                  {currentStepIndex > 0
                    ? t('wizard.navigation.back')
                    : t('wizard.navigation.cancel')}
                </span>
              </button>
              <PrimaryButton
                onClick={handleNext}
                disabled={!canProceed()}
                icon={state.currentStep === 'config' ? <Play className="w-4 h-4" /> : undefined}
              >
                {state.currentStep === 'config' ? (
                  t('wizard.navigation.start')
                ) : (
                  <>
                    {t('wizard.navigation.next')}
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </PrimaryButton>
            </div>
          </footer>
        )}
      </div>

      {/* Preflight Error Modal */}
      <PreflightErrorModal
        isOpen={preflightErrors.length > 0}
        onClose={clearPreflightErrors}
        errors={preflightErrors}
        onOpenSettings={(tab) => {
          clearPreflightErrors();
          if (tab) {
            setSettingsTab(tab);
          }
          setShowSettings(true);
        }}
      />
    </div>
  );
}
