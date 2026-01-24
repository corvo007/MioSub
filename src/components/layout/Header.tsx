import React from 'react';
import { Languages, FileText, Book, Settings } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageHeader, HeaderButton } from './PageHeader';
import { useAppStore } from '@/store/useAppStore';

/**
 * Application header with navigation buttons.
 * Consumes modal visibility actions directly from global store.
 */
export const Header: React.FC = () => {
  const { t } = useTranslation('ui');
  const setShowLogs = useAppStore((s) => s.setShowLogs);
  const setShowGlossaryManager = useAppStore((s) => s.setShowGlossaryManager);
  const setShowSettings = useAppStore((s) => s.setShowSettings);

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
          <HeaderButton
            onClick={() => setShowLogs(true)}
            icon={<FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
            label={t('header.logs')}
            title={t('header.viewLogs')}
            hoverColor="blue"
          />
          <HeaderButton
            onClick={() => setShowGlossaryManager(true)}
            icon={<Book className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
            label={t('header.glossary')}
            title={t('header.manageGlossary')}
            hoverColor="indigo"
          />
          <HeaderButton
            onClick={() => setShowSettings(true)}
            icon={<Settings className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
            label={t('header.settings')}
            hoverColor="emerald"
          />
        </>
      }
    />
  );
};
