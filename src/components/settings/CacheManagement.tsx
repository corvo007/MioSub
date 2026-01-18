import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import { SectionHeader } from '@/components/ui/SectionHeader';

// Format bytes to human readable string
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export const CacheManagement: React.FC = () => {
  const { t } = useTranslation('settings');
  const [cacheInfo, setCacheInfo] = useState<{ size: number; fileCount: number } | null>(null);
  const [clearing, setClearing] = useState(false);

  const loadCacheInfo = useCallback(async () => {
    if (window.electronAPI?.cache?.getSize) {
      const info = await window.electronAPI.cache.getSize();
      setCacheInfo(info);
    }
  }, []);

  useEffect(() => {
    void loadCacheInfo();
  }, [loadCacheInfo]);

  const handleClearCache = async () => {
    if (!window.electronAPI?.cache?.clear) return;
    setClearing(true);
    try {
      await window.electronAPI.cache.clear();
      await loadCacheInfo();
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="space-y-3">
      <SectionHeader>{t('performance.cache.title', 'Video Preview Cache')}</SectionHeader>
      <div className="flex items-center justify-between bg-white border border-slate-200 rounded-lg p-3 shadow-sm">
        <div>
          <p className="text-sm text-slate-500">
            {t('performance.cache.currentSize', 'Current Size')}
          </p>
          <p className="text-lg font-semibold text-slate-900">
            {cacheInfo ? formatBytes(cacheInfo.size) : '...'}
            <span className="text-sm text-slate-500 ml-2">
              ({cacheInfo?.fileCount ?? 0} {t('performance.cache.files', 'files')})
            </span>
          </p>
        </div>
        <button
          onClick={handleClearCache}
          disabled={clearing || !cacheInfo || cacheInfo.fileCount === 0}
          className="flex items-center gap-2 px-4 py-2 bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 hover:text-red-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
        >
          <Trash2 className="w-4 h-4" />
          {clearing
            ? t('performance.cache.clearing', 'Clearing...')
            : t('performance.cache.clear', 'Clear Cache')}
        </button>
      </div>
      <p className="text-xs text-slate-500">
        {t(
          'performance.cache.hint',
          'Cached video previews allow faster loading when reopening the same video.'
        )}
      </p>
    </div>
  );
};
