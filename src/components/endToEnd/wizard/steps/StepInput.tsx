import React, { useState, useEffect } from 'react';
import { Link2, Loader2, AlertCircle, Sparkles, CheckCircle } from 'lucide-react';
import { formatDuration } from '@/services/subtitle/time';
import { isValidVideoUrl } from '@/services/utils/url';
import { PrimaryButton } from '@/components/ui/PrimaryButton';

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
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500/20 to-indigo-500/20 border border-violet-500/30 mb-4">
          <Link2 className="w-8 h-8 text-violet-400" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">输入视频链接</h2>
        <p className="text-white/60">支持 YouTube 和 Bilibili 视频</p>
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
            placeholder="粘贴视频链接，如 https://www.youtube.com/watch?v=..."
            className={`w-full px-4 py-4 bg-white/5 border rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 transition-all ${
              validationResult?.valid === false
                ? 'border-red-500/50 focus:border-red-500/50 focus:ring-red-500/20'
                : validationResult?.valid
                  ? 'border-emerald-500/30 focus:border-emerald-500/50 focus:ring-emerald-500/20'
                  : 'border-white/10 focus:border-violet-500/50 focus:ring-violet-500/20'
            }`}
            disabled={isParsing}
          />
          <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
            {isParsing && <Loader2 className="w-5 h-5 text-violet-400 animate-spin" />}
          </div>
        </div>

        {/* Validation error */}
        {validationResult?.error && !validationResult.valid && (
          <div className="flex items-start gap-3 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-200 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{validationResult.error}</span>
          </div>
        )}

        {/* Parse error from server */}
        {parseError && (
          <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-200">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <span>{parseError}</span>
          </div>
        )}

        {videoInfo && (
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
            <div className="flex items-start gap-4">
              {videoInfo.thumbnail && (
                <img
                  src={videoInfo.thumbnail}
                  alt="Thumbnail"
                  className="w-24 h-16 object-cover rounded-lg"
                  onError={(e) => {
                    // Hide broken thumbnail
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              )}
              <div className="flex-1 min-w-0">
                <h4 className="font-medium text-white truncate">{videoInfo.title || '未知标题'}</h4>
                <p className="text-sm text-white/60">{videoInfo.uploader || '未知作者'}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs px-2 py-0.5 bg-emerald-500/20 text-emerald-300 rounded">
                    {videoInfo.platform || '视频'}
                  </span>
                  {videoInfo.duration != null && (
                    <span className="text-xs text-white/50">
                      {formatDuration(videoInfo.duration)}
                    </span>
                  )}
                </div>
              </div>
              <CheckCircle className="w-6 h-6 text-emerald-400 shrink-0" />
            </div>
          </div>
        )}

        <PrimaryButton
          onClick={handleParse}
          disabled={isParsing || !inputUrl.trim() || validationResult?.valid === false}
          loading={isParsing}
          loadingText="正在解析..."
          icon={<Sparkles className="w-5 h-5" />}
          size="lg"
          fullWidth
        >
          解析视频
        </PrimaryButton>
      </div>
    </div>
  );
}
