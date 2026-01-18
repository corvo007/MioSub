/**
 * URL Input Component - Tailwind CSS Version
 */
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PrimaryButton } from '@/components/ui/PrimaryButton';

import { isValidVideoUrl } from '@/services/utils/url';

interface UrlInputProps {
  onParse: (url: string) => void;
  disabled?: boolean;
  loading?: boolean;
}

export function UrlInput({ onParse, disabled, loading }: UrlInputProps) {
  const { t } = useTranslation('download');
  const [url, setUrl] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      onParse(url.trim());
    }
  };

  const validation = isValidVideoUrl(url);
  const isValidUrl = validation.valid;

  return (
    <div className="mb-6">
      <form onSubmit={handleSubmit}>
        <div className="flex gap-3">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={t('urlPlaceholder')}
            disabled={disabled}
            className="flex-1 px-4 py-3.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-base
                          placeholder:text-slate-400 transition-all shadow-sm
                          focus:outline-none focus:border-brand-purple focus:ring-3 focus:ring-brand-purple/20
                          disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white focus:bg-white"
          />
          <PrimaryButton
            type="submit"
            disabled={disabled || !isValidUrl}
            loading={loading}
            loadingText={t('parsing')}
          >
            {t('parse')}
          </PrimaryButton>
        </div>
      </form>
    </div>
  );
}
