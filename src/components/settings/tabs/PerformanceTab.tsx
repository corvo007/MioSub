import React from 'react';
import { useTranslation } from 'react-i18next';
import { NumberInput } from '@/components/ui/NumberInput';
import { Toggle } from '@/components/ui/Toggle';
import { SettingRow } from '@/components/ui/SettingRow';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { CacheManagement } from '@/components/settings/CacheManagement';
import type { TabProps } from './types';

export const PerformanceTab: React.FC<TabProps> = ({ settings, updateSetting }) => {
  const { t } = useTranslation('settings');
  const isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Batch Processing Section */}
      <div className="space-y-4">
        <SectionHeader>{t('performance.batch.title')}</SectionHeader>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              {t('performance.batch.proofreadBatchSize')}
            </label>
            <NumberInput
              value={settings.proofreadBatchSize || undefined}
              onChange={(v) => updateSetting('proofreadBatchSize', v ?? 0)}
              min={0}
              className="w-full"
            />
            <p className="text-xs text-slate-500 mt-1">
              {t('performance.batch.proofreadBatchSizeHint')}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              {t('performance.batch.translationBatchSize')}
            </label>
            <NumberInput
              value={settings.translationBatchSize || undefined}
              onChange={(v) => updateSetting('translationBatchSize', v ?? 0)}
              min={0}
              className="w-full"
            />
            <p className="text-xs text-slate-500 mt-1">
              {t('performance.batch.translationBatchSizeHint')}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              {t('performance.batch.chunkDuration')}
            </label>
            <NumberInput
              value={settings.chunkDuration || undefined}
              onChange={(v) => updateSetting('chunkDuration', v ?? 0)}
              min={0}
              className="w-full"
            />
            <p className="text-xs text-slate-500 mt-1">
              {t('performance.batch.chunkDurationHint')}
            </p>
          </div>
        </div>
      </div>

      {/* Concurrency & Timeout Section */}
      <div className="space-y-4">
        <SectionHeader>{t('performance.concurrency.title')}</SectionHeader>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              {t('performance.concurrency.concurrencyFlash')}
            </label>
            <NumberInput
              value={settings.concurrencyFlash || undefined}
              onChange={(v) => updateSetting('concurrencyFlash', v ?? 0)}
              min={0}
              className="w-full"
            />
            <p
              className="text-xs text-slate-500 mt-1"
              dangerouslySetInnerHTML={{
                __html: t('performance.concurrency.concurrencyFlashHint'),
              }}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              {t('performance.concurrency.concurrencyPro')}
            </label>
            <NumberInput
              value={settings.concurrencyPro || undefined}
              onChange={(v) => updateSetting('concurrencyPro', v ?? 0)}
              min={0}
              className="w-full"
            />
            <p
              className="text-xs text-slate-500 mt-1"
              dangerouslySetInnerHTML={{
                __html: t('performance.concurrency.concurrencyProHint'),
              }}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              {t('performance.concurrency.localConcurrency')}
            </label>
            <NumberInput
              value={settings.localConcurrency}
              onChange={(v) => updateSetting('localConcurrency', v)}
              min={1}
              max={4}
              defaultOnBlur={1}
              placeholder="1"
              className="w-full"
            />
            <p className="text-xs text-slate-500 mt-1">
              {t('performance.concurrency.localConcurrencyHint')}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              {t('performance.concurrency.requestTimeout')}
            </label>
            <NumberInput
              value={settings.requestTimeout || undefined}
              onChange={(v) => updateSetting('requestTimeout', v ?? 600)}
              min={0}
              placeholder="600"
              className="w-full"
            />
            <p className="text-xs text-slate-500 mt-1">
              {t('performance.concurrency.requestTimeoutHint')}
            </p>
          </div>
        </div>
      </div>

      {/* Audio Processing Section */}
      <div className="space-y-4">
        <SectionHeader>{t('performance.audio.title')}</SectionHeader>
        <SettingRow
          label={t('performance.audio.smartSplit')}
          description={t('performance.audio.smartSplitDesc')}
        >
          <Toggle
            checked={settings.useSmartSplit !== false}
            onChange={(v) => updateSetting('useSmartSplit', v)}
          />
        </SettingRow>
      </div>

      {/* Video Preview Cache - Only show in Electron */}
      {isElectron && (
        <div className="space-y-4">
          <CacheManagement />
        </div>
      )}
    </div>
  );
};
