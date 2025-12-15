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
import { useEndToEnd } from '@/hooks/useEndToEnd';
import { EndToEndProgress } from '@/components/endToEnd/EndToEndProgress';
import type { AppSettings } from '@/types/settings';
import { StepIndicator } from '@/components/endToEnd/wizard/shared/StepIndicator';
import { StepInput } from '@/components/endToEnd/wizard/steps/StepInput';
import { StepConfig } from '@/components/endToEnd/wizard/steps/StepConfig';
import { StepResult } from '@/components/endToEnd/wizard/steps/StepResult';
import { PageHeader, HeaderButton } from '@/components/layout/PageHeader';

interface EndToEndWizardProps {
  settings: AppSettings;
  onComplete?: () => void;
  onCancel: () => void;
  onShowLogs?: () => void;
  onShowGlossary?: () => void;
  onShowSettings?: () => void;
}

/** 主向导组件*/
export function EndToEndWizard({
  settings,
  onComplete,
  onCancel,
  onShowLogs,
  onShowGlossary,
  onShowSettings,
}: EndToEndWizardProps) {
  const {
    state,
    setStep,
    goNext,
    goBack,
    updateConfig,
    resetConfig,
    resetToConfig,
    retryPipeline,
    parseUrl,
    videoInfo,
    startPipeline,
    abortPipeline,
    isElectron,
  } = useEndToEnd();

  const steps = [
    { label: '输入链接', icon: <Link2 className="w-4 h-4" /> },
    { label: '配置参数', icon: <Settings className="w-4 h-4" /> },
    { label: '执行处理', icon: <Play className="w-4 h-4" /> },
    { label: '完成', icon: <CheckCircle className="w-4 h-4" /> },
  ];

  const currentStepIndex = ['input', 'config', 'progress', 'result'].indexOf(state.currentStep);

  // Check if can proceed to next step
  const canProceed = () => {
    if (state.currentStep === 'input') {
      return !!videoInfo;
    }
    if (state.currentStep === 'config') {
      return !!state.config.outputDir;
    }
    return false;
  };

  const handleNext = async () => {
    if (state.currentStep === 'config') {
      // Start pipeline
      await startPipeline();
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
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-8">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-amber-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">功能不可用</h2>
          <p className="text-white/60 mb-6">此功能仅在桌面版可用</p>
          <button
            onClick={onCancel}
            className="px-6 py-3 bg-white/10 border border-white/20 rounded-xl text-white"
          >
            返回
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden bg-slate-950 flex flex-col p-4 md:p-8">
      <div className="max-w-7xl mx-auto w-full flex-1 flex flex-col min-h-0">
        {/* Header */}
        <PageHeader
          title={
            <>
              <span className="truncate">全自动模式</span>
              <span className="text-[10px] sm:text-xs font-normal text-slate-500 bg-slate-900 border border-slate-800 px-1.5 sm:px-2 py-0.5 rounded whitespace-nowrap">
                端到端模式
              </span>
            </>
          }
          subtitle="输入链接，自动生成字幕视频"
          onBack={onCancel}
          actions={
            <>
              {onShowLogs && (
                <HeaderButton
                  onClick={onShowLogs}
                  icon={<FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                  label="日志"
                  title="查看日志"
                  hoverColor="blue"
                />
              )}
              {onShowGlossary && (
                <HeaderButton
                  onClick={onShowGlossary}
                  icon={<Book className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                  label="术语表"
                  title="术语表管理"
                  hoverColor="indigo"
                />
              )}
              {onShowSettings && (
                <HeaderButton
                  onClick={onShowSettings}
                  icon={<Settings className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                  label="设置"
                  hoverColor="emerald"
                />
              )}
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
          <footer className="py-4 border-t border-slate-800 shrink-0">
            <div className="max-w-3xl mx-auto flex justify-between">
              <button
                onClick={currentStepIndex > 0 ? goBack : onCancel}
                className="px-6 py-3 bg-white/10 border border-white/20 rounded-xl text-white font-medium transition-colors hover:bg-white/15"
              >
                <span className="flex items-center gap-2">
                  <ArrowLeft className="w-4 h-4" />
                  {currentStepIndex > 0 ? '上一步' : '取消'}
                </span>
              </button>
              <button
                onClick={handleNext}
                disabled={!canProceed()}
                className="px-6 py-3 bg-gradient-to-r from-violet-500 to-indigo-500 rounded-xl text-white font-medium transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-violet-500/30 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
              >
                <span className="flex items-center gap-2">
                  {state.currentStep === 'config' ? (
                    <>
                      <Play className="w-4 h-4" />
                      开始处理
                    </>
                  ) : (
                    <>
                      下一步
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </span>
              </button>
            </div>
          </footer>
        )}
      </div>
    </div>
  );
}
