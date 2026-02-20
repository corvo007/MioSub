/**
 * Preflight Error Modal
 *
 * Displays configuration errors before generation starts.
 * Allows user to navigate to settings to fix issues.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, AlertCircle, Settings, ExternalLink } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/lib/cn';

export interface PreflightError {
  code: string;
  message: string;
  field?: string;
  tab?: 'services' | 'enhance' | 'about';
  docUrl?: string;
  severity?: 'error' | 'warning';
}

interface PreflightErrorModalProps {
  isOpen: boolean;
  onClose: () => void;
  errors: PreflightError[];
  onOpenSettings: (tab?: 'services' | 'enhance' | 'about') => void;
  onContinue?: () => void;
}

export const PreflightErrorModal: React.FC<PreflightErrorModalProps> = ({
  isOpen,
  onClose,
  errors,
  onOpenSettings,
  onContinue,
}) => {
  const { t } = useTranslation('workspace');

  const hasErrors = errors.some((e) => e.severity !== 'warning');
  const canContinue = !hasErrors && !!onContinue;

  const hasSettingsAction = errors.some((e) => e.tab);

  const handleGoToSettings = (error: PreflightError) => {
    onClose();
    onOpenSettings(error.tab);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('preflight.title')}
      icon={<AlertTriangle className="w-5 h-5 text-amber-500" />}
      maxWidth="md"
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">{t('preflight.description')}</p>

        <div className="space-y-3">
          {errors.map((error, index) => {
            const isWarning = error.severity === 'warning';
            return (
              <div
                key={`${error.code}-${index}`}
                className={cn(
                  'flex items-start gap-3 p-3 rounded-lg border',
                  isWarning ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'
                )}
              >
                {isWarning ? (
                  <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <p
                    className={cn(
                      'text-sm font-medium',
                      isWarning ? 'text-amber-800' : 'text-red-800'
                    )}
                  >
                    {error.message}
                    {error.docUrl && (
                      <>
                        {' '}
                        <a
                          href={error.docUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-0.5 text-brand-purple hover:text-brand-purple/80 underline underline-offset-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            void window.electronAPI?.openExternal?.(error.docUrl!);
                            e.preventDefault();
                          }}
                        >
                          {t('preflight.seeDoc')}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </>
                    )}
                  </p>
                  {(error.field || error.tab) && (
                    <button
                      onClick={() => handleGoToSettings(error)}
                      className={cn(
                        'mt-2 inline-flex items-center gap-1.5 text-xs underline underline-offset-2',
                        isWarning
                          ? 'text-amber-600 hover:text-amber-700'
                          : 'text-red-600 hover:text-red-700'
                      )}
                    >
                      <Settings className="w-3.5 h-3.5" />
                      {t('preflight.goToSettings')}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={onClose}
            className={cn(
              'px-4 py-2 text-sm font-medium rounded-lg transition-colors',
              hasSettingsAction || canContinue
                ? 'text-slate-600 hover:text-slate-800 hover:bg-slate-100'
                : 'text-white bg-brand-purple hover:bg-brand-purple/90 shadow-sm'
            )}
          >
            {t('preflight.close')}
          </button>
          {canContinue && (
            <button
              onClick={() => {
                onContinue();
                onClose();
              }}
              className="px-4 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-600 rounded-lg transition-colors shadow-sm"
            >
              {t('preflight.continueAnyway')}
            </button>
          )}
          {errors.some((e) => e.tab) && (
            <button
              onClick={() => {
                onClose();
                onOpenSettings(errors[0]?.tab);
              }}
              className="px-4 py-2 text-sm font-medium text-white bg-brand-purple hover:bg-brand-purple/90 rounded-lg transition-colors shadow-sm"
            >
              <span className="flex items-center gap-2">
                <Settings className="w-4 h-4" />
                {t('preflight.openSettings')}
              </span>
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
};
