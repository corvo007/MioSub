import React, { useState, useRef, useEffect } from 'react';
import { HelpCircle, FileQuestion, MessageCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { HeaderButton } from './PageHeader';
import { cn } from '@/lib/cn';

/**
 * Help button component with dropdown for Chinese users.
 * - Chinese users: Shows dropdown with docs link and QQ group number
 * - Other users: Directly opens documentation
 */
export const HelpButton: React.FC = () => {
  const { t, i18n } = useTranslation('ui');
  const [showHelpMenu, setShowHelpMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const helpMenuRef = useRef<HTMLDivElement>(null);

  const isChinese = i18n.language.startsWith('zh');

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (helpMenuRef.current && !helpMenuRef.current.contains(event.target as Node)) {
        setShowHelpMenu(false);
      }
    };

    if (showHelpMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showHelpMenu]);

  const handleHelpClick = () => {
    if (isChinese) {
      setShowHelpMenu(!showHelpMenu);
    } else {
      // Non-Chinese users: directly open docs
      const docsUrl = 'https://miosub.app/en/docs';
      if (window.electronAPI?.openExternal) {
        window.electronAPI.openExternal(docsUrl);
      } else {
        window.open(docsUrl, '_blank');
      }
    }
  };

  const handleOpenDocs = () => {
    const docsUrl = 'https://miosub.app/docs';
    if (window.electronAPI?.openExternal) {
      window.electronAPI.openExternal(docsUrl);
    } else {
      window.open(docsUrl, '_blank');
    }
    setShowHelpMenu(false);
  };

  const handleCopyQQGroup = async () => {
    const qqGroupNumber = '1082480420';
    try {
      await navigator.clipboard.writeText(qqGroupNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = qqGroupNumber;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="relative" ref={helpMenuRef}>
      <HeaderButton
        onClick={handleHelpClick}
        icon={<HelpCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
        label={t('header.help')}
        title={t('header.viewHelp')}
        hoverColor="amber"
      />
      {/* Dropdown menu for Chinese users */}
      {showHelpMenu && isChinese && (
        <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-50">
          <button
            onClick={handleOpenDocs}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <FileQuestion className="w-4 h-4 text-slate-400" />
            {t('header.docs')}
          </button>
          <button
            onClick={handleCopyQQGroup}
            className={cn(
              'w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors',
              copied ? 'text-emerald-600 bg-emerald-50' : 'text-slate-700 hover:bg-slate-50'
            )}
          >
            <MessageCircle className="w-4 h-4 text-slate-400" />
            <span>
              {t('header.qqGroup')}: {t('header.qqGroupNumber')}
            </span>
            {copied && (
              <span className="ml-auto text-xs text-emerald-600">{t('header.copied')}</span>
            )}
          </button>
        </div>
      )}
    </div>
  );
};
