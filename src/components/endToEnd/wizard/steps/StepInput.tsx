import React, { useState, useEffect } from 'react';
import { Link2, Loader2, AlertCircle, Sparkles, CheckCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatDuration } from '@/services/subtitle/time';
import { isValidVideoUrl } from '@/services/utils/url';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { cn } from '@/lib/cn';

/** 步骤 1: 输入链接 */
export function StepInput({
  url,
  onUrlChange,
  onParse,
  isParsing,
  parseError,
  videoInfo,
}: {
  url: string;
  onUrlChange: (url: string) => void;
  onParse: (url?: string) => void;
  isParsing: boolean;
  parseError?: string;
  videoInfo?: any;
}) {
  const { t } = useTranslation('endToEnd');
  const [inputUrl, setInputUrl] = useState(url);
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    platform?: string;
    error?: string;
  } | null>(null);

  // Validate URL on change
  useEffect(() => {
    if (inputUrl.trim()) {
      setValidationResult(isValidVideoUrl(inputUrl));
    } else {
      setValidationResult(null);
    }
  }, [inputUrl]);

  const handleParse = () => {
    const trimmedUrl = inputUrl.trim();
    if (!trimmedUrl) return;
    onUrlChange(trimmedUrl);
    onParse(trimmedUrl); // 直接传递 URL，不依赖状态更新
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-50 border border-indigo-100 mb-4 shadow-sm">
          <Link2 className="w-8 h-8 text-brand-purple" />
        </div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">{t('wizard.inputStep.title')}</h2>
        <p className="text-slate-500">{t('wizard.inputStep.description')}</p>
      </div>

      <div className="space-y-4">
        <div className="relative">
          <input
            type="text"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            onKeyDown={(e) =>
              e.key === 'Enter' && !isParsing && validationResult?.valid && handleParse()
            }
            placeholder={t('wizard.inputStep.placeholder')}
            className={cn(
              'w-full px-4 py-4 bg-white border rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 transition-all shadow-sm',
              validationResult?.valid === false &&
                'border-red-200 focus:border-red-300 focus:ring-red-100 bg-red-50/30',
              validationResult?.valid === true &&
                'border-emerald-200 focus:border-emerald-300 focus:ring-emerald-100 bg-emerald-50/30',
              validationResult === null &&
                'border-slate-200 focus:border-brand-purple/50 focus:ring-brand-purple/10'
            )}
            disabled={isParsing}
          />
          <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
            {isParsing && <Loader2 className="w-5 h-5 text-brand-purple animate-spin" />}
          </div>
        </div>

        {/* Validation error */}
        {validationResult?.error && !validationResult.valid && (
          <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{validationResult.error}</span>
          </div>
        )}

        {/* Parse error from server */}
        {parseError && (
          <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-100 rounded-xl text-red-600">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <span>{parseError}</span>
          </div>
        )}

        {videoInfo && (
          <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl shadow-sm">
            <div className="flex items-start gap-4">
              {videoInfo.thumbnail && (
                <img
                  src={videoInfo.thumbnail}
                  alt="Thumbnail"
                  className="w-24 h-16 object-cover rounded-lg border border-emerald-100"
                  onError={(e) => {
                    // Hide broken thumbnail
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              )}
              <div className="flex-1 min-w-0">
                <h4 className="font-medium text-slate-800 truncate">
                  {videoInfo.title || t('wizard.inputStep.unknownTitle')}
                </h4>
                <p className="text-sm text-slate-500">
                  {videoInfo.uploader || t('wizard.inputStep.unknownAuthor')}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded border border-emerald-200">
                    {videoInfo.platform || t('wizard.inputStep.video')}
                  </span>
                  {videoInfo.duration != null && (
                    <span className="text-xs text-slate-400">
                      {formatDuration(videoInfo.duration)}
                    </span>
                  )}
                </div>
              </div>
              <CheckCircle className="w-6 h-6 text-emerald-500 shrink-0" />
            </div>
          </div>
        )}

        <PrimaryButton
          onClick={handleParse}
          disabled={isParsing || !inputUrl.trim() || validationResult?.valid === false}
          loading={isParsing}
          loadingText={t('wizard.inputStep.parsing')}
          icon={<Sparkles className="w-5 h-5" />}
          size="lg"
          fullWidth
        >
          {t('wizard.inputStep.parseButton')}
        </PrimaryButton>
      </div>
    </div>
  );
}
