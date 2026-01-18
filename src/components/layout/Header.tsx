import React from 'react';
import { Languages, FileText, Book, Settings } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageHeader, HeaderButton } from './PageHeader';

interface HeaderProps {
  onShowLogs?: () => void;
  onShowGlossary?: () => void;
  onShowSettings?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onShowLogs, onShowGlossary, onShowSettings }) => {
  const { t } = useTranslation('ui');
  return (
    <PageHeader
      title={
        <>
          <span className="bg-linear-to-r from-brand-purple to-brand-orange bg-clip-text text-transparent">
            MioSub
          </span>
        </>
      }
      subtitle={t('header.subtitle')}
      icon={<Languages className="w-5 h-5 sm:w-6 sm:h-6 text-white" />}
      actions={
        <>
          {onShowLogs && (
            <HeaderButton
              onClick={onShowLogs}
              icon={<FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
              label={t('header.logs')}
              title={t('header.viewLogs')}
              hoverColor="blue"
            />
          )}
          {onShowGlossary && (
            <HeaderButton
              onClick={onShowGlossary}
              icon={<Book className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
              label={t('header.glossary')}
              title={t('header.manageGlossary')}
              hoverColor="indigo"
            />
          )}
          {onShowSettings && (
            <HeaderButton
              onClick={onShowSettings}
              icon={<Settings className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
              label={t('header.settings')}
              hoverColor="emerald"
            />
          )}
        </>
      }
    />
  );
};
