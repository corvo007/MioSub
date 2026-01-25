import React from 'react';
import { useTranslation } from 'react-i18next';
import { Bug } from 'lucide-react';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { TextInput } from '@/components/ui/TextInput';
import { Toggle } from '@/components/ui/Toggle';
import { SettingRow } from '@/components/ui/SettingRow';
import type { TabProps } from './types';

export const DebugTab: React.FC<TabProps> = ({ settings, updateSetting }) => {
  const { t } = useTranslation('settings');

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
        <h3 className="text-sm font-semibold text-amber-700 mb-2 flex items-center">
          <Bug className="w-4 h-4 mr-2" /> {t('debug.title')}
        </h3>
        <p className="text-xs text-slate-600 mb-4">{t('debug.description')}</p>

        <div className="space-y-4">
          {/* Mock Stage Dropdown */}
          <SettingRow
            label={t('debug.startFrom.title', 'Start Pipeline From')}
            description={t(
              'debug.startFrom.desc',
              'Skip stages before this point and load state from file/preset'
            )}
          >
            <CustomSelect
              value={settings.debug?.mockStage || ''}
              onChange={(value) =>
                updateSetting('debug', {
                  ...(settings.debug || {}),
                  mockStage: (value as any) || undefined,
                })
              }
              className="w-64"
              options={[
                { value: '', label: t('debug.mockStage.none') },
                { value: 'transcribe', label: t('debug.mockStage.transcribe') },
                { value: 'refinement', label: t('debug.mockStage.refinement') },
                { value: 'alignment', label: t('debug.mockStage.alignment') },
                { value: 'translation', label: t('debug.mockStage.translation') },
              ]}
            />
          </SettingRow>

          {/* Mock Data Path - Tied to Start From */}
          <div className="space-y-4 pt-2">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {t('debug.mockData.title')}
              </label>
              <p className="text-xs text-slate-500 mb-2">{t('debug.mockData.hint')}</p>
              <TextInput
                type="text"
                value={settings.debug?.mockDataPath || ''}
                onChange={(e) =>
                  updateSetting('debug', {
                    ...(settings.debug || {}),
                    mockDataPath: e.target.value || undefined,
                  })
                }
                placeholder={t('debug.mockData.placeholder')}
                className="w-full"
              />
            </div>

            {/* Mock Language - Often needed for alignment/start from */}
            <div className="mt-3">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {t('debug.language.title')}
              </label>
              <p className="text-xs text-slate-500 mb-2">{t('debug.language.desc')}</p>
              <CustomSelect
                value={settings.debug?.mockLanguage || ''}
                onChange={(value) =>
                  updateSetting('debug', {
                    ...(settings.debug || {}),
                    mockLanguage: value || undefined,
                  })
                }
                className="w-full"
                options={[
                  { value: '', label: 'Auto' },
                  { value: 'eng', label: 'English' },
                  { value: 'cmn', label: '中文' },
                  { value: 'jpn', label: '日本語' },
                  { value: 'kor', label: '한국어' },
                ]}
              />
            </div>
          </div>

          {/* Exit Control - Grouped with Start From */}
          <div className="space-y-3 pt-4 border-t border-slate-200 mt-4">
            <SettingRow label={t('debug.skipAfter.title')} description={t('debug.skipAfter.desc')}>
              <CustomSelect
                value={settings.debug?.skipAfter || ''}
                onChange={(value) =>
                  updateSetting('debug', {
                    ...(settings.debug || {}),
                    skipAfter: (value as any) || undefined,
                  })
                }
                className="w-64"
                options={[
                  { value: '', label: t('debug.skipAfter.none') },
                  { value: 'transcribe', label: t('debug.skipAfter.transcribe') },
                  { value: 'refinement', label: t('debug.skipAfter.refinement') },
                  { value: 'alignment', label: t('debug.skipAfter.alignment') },
                ]}
              />
            </SettingRow>

            <SettingRow
              label={t('debug.saveIntermediateArtifacts')}
              description={t('debug.saveIntermediateArtifactsDesc')}
            >
              <Toggle
                checked={settings.debug?.saveIntermediateArtifacts || false}
                onChange={(v) =>
                  updateSetting('debug', {
                    ...(settings.debug || {}),
                    saveIntermediateArtifacts: v,
                  })
                }
                color="amber"
              />
            </SettingRow>
          </div>

          {/* Mock API Calls */}
          <div className="space-y-3 pt-4 border-t border-slate-200 mt-4">
            <h4 className="text-sm font-medium text-slate-700">
              {t('debug.mockApi.title', 'Mock API Calls (Skip & Pass-through)')}
            </h4>
            <div className="grid grid-cols-2 gap-4">
              {/* Pre-processing */}
              <SettingRow
                label={t('debug.mockApi.glossary', 'Glossary')}
                description={t('debug.mockApi.glossaryDesc', 'Skip extraction')}
              >
                <Toggle
                  checked={settings.debug?.mockApi?.glossary || false}
                  onChange={(v) =>
                    updateSetting('debug', {
                      ...(settings.debug || {}),
                      mockApi: { ...(settings.debug?.mockApi || {}), glossary: v },
                    })
                  }
                  color="amber"
                />
              </SettingRow>
              <SettingRow
                label={t('debug.mockApi.speaker', 'Speaker')}
                description={t('debug.mockApi.speakerDesc', 'Skip pre-analysis')}
              >
                <Toggle
                  checked={settings.debug?.mockApi?.speaker || false}
                  onChange={(v) =>
                    updateSetting('debug', {
                      ...(settings.debug || {}),
                      mockApi: { ...(settings.debug?.mockApi || {}), speaker: v },
                    })
                  }
                  color="amber"
                />
              </SettingRow>

              {/* Core Pipeline */}
              <SettingRow
                label={t('debug.mockApi.transcribe', 'Transcribe')}
                description={t('debug.mockApi.transcribeDesc', 'Use mock data preset')}
              >
                <Toggle
                  checked={settings.debug?.mockApi?.transcribe || false}
                  onChange={(v) =>
                    updateSetting('debug', {
                      ...(settings.debug || {}),
                      mockApi: { ...(settings.debug?.mockApi || {}), transcribe: v },
                    })
                  }
                  color="amber"
                />
              </SettingRow>
              <SettingRow
                label={t('debug.mockApi.refinement', 'Refinement')}
                description={t('debug.mockApi.refinementDesc', 'Pass-through original')}
              >
                <Toggle
                  checked={settings.debug?.mockApi?.refinement || false}
                  onChange={(v) =>
                    updateSetting('debug', {
                      ...(settings.debug || {}),
                      mockApi: { ...(settings.debug?.mockApi || {}), refinement: v },
                    })
                  }
                  color="amber"
                />
              </SettingRow>
              <SettingRow
                label={t('debug.mockApi.alignment', 'Alignment')}
                description={t('debug.mockApi.alignmentDesc', 'Skip CTC, use refined times')}
              >
                <Toggle
                  checked={settings.debug?.mockApi?.alignment || false}
                  onChange={(v) =>
                    updateSetting('debug', {
                      ...(settings.debug || {}),
                      mockApi: { ...(settings.debug?.mockApi || {}), alignment: v },
                    })
                  }
                  color="amber"
                />
              </SettingRow>
              <SettingRow
                label={t('debug.mockApi.translation', 'Translation')}
                description={t('debug.mockApi.translationDesc', 'Echo original text')}
              >
                <Toggle
                  checked={settings.debug?.mockApi?.translation || false}
                  onChange={(v) =>
                    updateSetting('debug', {
                      ...(settings.debug || {}),
                      mockApi: { ...(settings.debug?.mockApi || {}), translation: v },
                    })
                  }
                  color="amber"
                />
              </SettingRow>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200">
            <h4 className="text-xs font-semibold text-slate-500 mb-3 uppercase tracking-wider">
              {t('debug.customPaths')}
            </h4>

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-600 mb-1">{t('debug.ffmpegPath')}</label>
                <input
                  type="text"
                  value={settings.debug?.ffmpegPath || ''}
                  onChange={(e) =>
                    updateSetting('debug', {
                      ...(settings.debug || {}),
                      ffmpegPath: e.target.value,
                    })
                  }
                  placeholder={t('debug.defaultAutoDetected')}
                  className="w-full bg-white border border-slate-200 rounded px-3 py-2 text-xs text-slate-700 focus:outline-none focus:border-brand-purple focus:ring-1 focus:ring-brand-purple shadow-sm placeholder-slate-400"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">
                  {t('debug.ffprobePath')}
                </label>
                <input
                  type="text"
                  value={settings.debug?.ffprobePath || ''}
                  onChange={(e) =>
                    updateSetting('debug', {
                      ...(settings.debug || {}),
                      ffprobePath: e.target.value,
                    })
                  }
                  placeholder={t('debug.defaultAutoDetected')}
                  className="w-full bg-white border border-slate-200 rounded px-3 py-2 text-xs text-slate-700 focus:outline-none focus:border-brand-purple focus:ring-1 focus:ring-brand-purple shadow-sm placeholder-slate-400"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
