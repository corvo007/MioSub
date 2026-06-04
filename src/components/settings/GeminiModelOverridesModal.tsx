import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Cpu } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Portal } from '@/components/ui/Portal';
import { STEP_MODELS, isGeminiModel, type StepName } from '@/config';
import type { AppSettings, GeminiModelOverrides } from '@/types/settings';

interface GeminiModelOverridesModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  updateSetting: (key: keyof AppSettings, value: any) => void;
  addToast: (message: string, type: 'info' | 'warning' | 'error' | 'success') => void;
}

// The five pipeline steps that map to a Gemini model, in display order.
// Keys match STEP_MODELS in src/config/models.ts.
const STEP_ORDER: StepName[] = [
  'refinement',
  'translation',
  'glossaryExtraction',
  'speakerProfile',
  'batchProofread',
];

/**
 * Per-step custom Gemini model name editor.
 *
 * Each field is prefilled with the current effective model (user override if
 * set, otherwise the built-in default). On save we validate that every
 * non-empty value is a Gemini-series id (contains the "gemini" keyword) and
 * persist only the steps that differ from their default — so future default
 * changes still propagate to untouched steps.
 */
export const GeminiModelOverridesModal: React.FC<GeminiModelOverridesModalProps> = ({
  isOpen,
  onClose,
  settings,
  updateSetting,
  addToast,
}) => {
  const { t } = useTranslation('settings');
  const [values, setValues] = useState<Record<StepName, string>>(() =>
    buildInitialValues(settings.geminiModelOverrides)
  );

  // Reset local state from the latest settings each time the modal opens.
  useEffect(() => {
    if (isOpen) {
      setValues(buildInitialValues(settings.geminiModelOverrides));
    }
  }, [isOpen, settings.geminiModelOverrides]);

  const handleChange = (step: StepName, value: string) => {
    setValues((prev) => ({ ...prev, [step]: value }));
  };

  const handleReset = () => {
    setValues(buildDefaultValues());
  };

  const handleSave = () => {
    // 1. Validate: every non-empty value must be a Gemini-series model id.
    const invalidSteps = STEP_ORDER.filter((step) => {
      const value = values[step].trim();
      return value.length > 0 && !isGeminiModel(value);
    });

    if (invalidSteps.length > 0) {
      const names = invalidSteps.map((step) => t(`services.geminiModels.steps.${step}`)).join('、');
      addToast(t('services.geminiModels.invalidModel', { fields: names }), 'error');
      return;
    }

    // 2. Persist only the steps that differ from their default. Empty fields
    //    fall back to the default (no override stored).
    const overrides: GeminiModelOverrides = {};
    for (const step of STEP_ORDER) {
      const value = values[step].trim();
      if (value && value !== STEP_MODELS[step]) {
        overrides[step] = value;
      }
    }

    updateSetting(
      'geminiModelOverrides',
      Object.keys(overrides).length > 0 ? overrides : undefined
    );
    addToast(t('services.geminiModels.saved'), 'success');
    onClose();
  };

  return (
    // Portal to document.body so the modal escapes the SettingsModal subtree.
    // SettingsModal's card uses overflow-hidden under the zoom-transformed #root,
    // which would otherwise clip this fixed-position modal's backdrop and leave
    // an uncovered strip at the bottom.
    <Portal>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={t('services.geminiModels.title')}
        icon={<Cpu className="w-5 h-5 text-brand-purple" />}
        maxWidth="lg"
        zIndex={80}
      >
        <div className="space-y-4">
          {/* Gemini-only warning */}
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-amber-700 leading-relaxed">
              {t('services.geminiModels.warning')}
            </p>
          </div>

          {/* How defaults work */}
          <p className="text-xs text-slate-500 leading-relaxed">
            {t('services.geminiModels.hint')}
          </p>

          {/* Per-step inputs */}
          <div className="space-y-3">
            {STEP_ORDER.map((step) => (
              <div key={step}>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {t(`services.geminiModels.steps.${step}`)}
                </label>
                <input
                  type="text"
                  value={values[step]}
                  onChange={(e) => handleChange(step, e.target.value)}
                  placeholder={STEP_MODELS[step]}
                  spellCheck={false}
                  className="w-full bg-white border border-slate-200 rounded-lg py-2.5 px-3 text-slate-700 focus:outline-none focus:border-brand-purple focus:ring-1 focus:ring-brand-purple text-sm placeholder-slate-400 shadow-sm transition-all font-mono"
                />
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex justify-between items-center pt-2">
            <button
              onClick={handleReset}
              className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm font-medium"
            >
              {t('services.geminiModels.reset')}
            </button>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-all shadow-sm font-medium"
              >
                {t('services.geminiModels.cancel')}
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-brand-purple text-white rounded-lg text-sm hover:bg-brand-purple/90 transition-all shadow-sm font-medium"
              >
                {t('services.geminiModels.save')}
              </button>
            </div>
          </div>
        </div>
      </Modal>
    </Portal>
  );
};

function buildDefaultValues(): Record<StepName, string> {
  return STEP_ORDER.reduce(
    (acc, step) => {
      acc[step] = STEP_MODELS[step];
      return acc;
    },
    {} as Record<StepName, string>
  );
}

function buildInitialValues(overrides?: GeminiModelOverrides): Record<StepName, string> {
  return STEP_ORDER.reduce(
    (acc, step) => {
      acc[step] = overrides?.[step]?.trim() || STEP_MODELS[step];
      return acc;
    },
    {} as Record<StepName, string>
  );
}
