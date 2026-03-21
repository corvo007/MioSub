import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, RefreshCw } from 'lucide-react';
import { Modal } from '@/components/ui';
import { changelogToHtml } from '@/services/utils/changelogParser';
import { useAppStore } from '@/store/useAppStore';
import pkg from '../../../package.json';

interface ChangelogModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** 'auto' = first-launch after update (updates lastSeenChangelog on close), 'manual' = from About tab */
  mode: 'auto' | 'manual';
  version?: string;
}

export const ChangelogModal: React.FC<ChangelogModalProps> = ({
  isOpen,
  onClose,
  mode,
  version,
}) => {
  const { t, i18n } = useTranslation('settings');
  const updateSetting = useAppStore((s) => s.updateSetting);

  const displayVersion = version || pkg.version;

  const [state, setState] = useState<{
    loading: boolean;
    content: string;
    error: string | null;
  }>({ loading: false, content: '', error: null });

  const fetchChangelog = useCallback(async () => {
    if (!window.electronAPI?.update?.fetchChangelog) {
      setState({ loading: false, content: '', error: 'Not available in web mode' });
      return;
    }
    setState({ loading: true, content: '', error: null });
    try {
      const result = await window.electronAPI.update.fetchChangelog(
        displayVersion,
        i18n.language || 'en-US'
      );
      if (result.success && result.changelog) {
        setState({ loading: false, content: result.changelog, error: null });
      } else {
        setState({ loading: false, content: '', error: result.error || 'Unknown error' });
      }
    } catch (err: any) {
      setState({ loading: false, content: '', error: err.message });
    }
  }, [displayVersion, i18n.language]);

  // Fetch on open
  useEffect(() => {
    if (isOpen) {
      void fetchChangelog();
    } else {
      // Reset state when closed
      setState({ loading: false, content: '', error: null });
    }
  }, [isOpen, fetchChangelog]);

  const handleClose = () => {
    // In auto mode, only mark as seen if content was successfully loaded
    if (mode === 'auto' && state.content && !state.error) {
      updateSetting('lastSeenChangelog', displayVersion);
    }
    onClose();
  };

  const htmlContent = changelogToHtml(state.content);

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={t('about.changelog.title', "What's New")}
      icon={<Sparkles className="w-5 h-5 text-brand-purple" />}
      maxWidth="lg"
    >
      <div className="space-y-4">
        {/* Version badge */}
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 bg-brand-purple/10 text-brand-purple text-sm font-bold rounded-lg border border-brand-purple/20">
            v{displayVersion}
          </span>
        </div>

        {/* Content area */}
        <div className="min-h-[120px] max-h-[60vh] overflow-y-auto pr-1">
          {state.loading && (
            <div className="flex items-center justify-center py-12 text-slate-400">
              <RefreshCw className="w-5 h-5 animate-spin mr-2" />
              <span>{t('about.changelog.loading', 'Loading release notes...')}</span>
            </div>
          )}

          {state.error && !state.loading && (
            <div className="text-center py-12 space-y-3">
              <p className="text-slate-500 text-sm">
                {t('about.changelog.error', 'Failed to load release notes.')}
              </p>
              <button
                onClick={() => void fetchChangelog()}
                className="px-4 py-2 text-sm text-brand-purple hover:bg-brand-purple/10 rounded-lg border border-brand-purple/20 transition-colors"
              >
                {t('about.changelog.retry', 'Retry')}
              </button>
            </div>
          )}

          {!state.loading && !state.error && state.content && (
            <div
              className="changelog-content prose prose-sm prose-slate max-w-none"
              dangerouslySetInnerHTML={{ __html: htmlContent }}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-2 border-t border-slate-100">
          <button
            onClick={handleClose}
            className="px-5 py-2 text-sm font-medium text-white bg-brand-purple hover:bg-brand-purple/90 rounded-lg transition-colors"
          >
            {t('about.changelog.dismiss', 'Got it')}
          </button>
        </div>
      </div>
    </Modal>
  );
};
