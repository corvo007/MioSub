import React from 'react';
import { GitCommit, FileText, Book, Settings } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageHeader, HeaderButton } from './PageHeader';

interface WorkspaceHeaderProps {
  title: string;
  modeLabel: string;
  subtitleInfo: string;
  onBack: () => void;
  showSnapshots: boolean;
  onToggleSnapshots: () => void;
  hasSnapshots: boolean;
  onShowLogs: () => void;
  onShowGlossary: () => void;
  onShowSettings: () => void;
}

export const WorkspaceHeader: React.FC<WorkspaceHeaderProps> = ({
  title,
  modeLabel,
  subtitleInfo,
  onBack,
  showSnapshots,
  onToggleSnapshots,
  hasSnapshots,
  onShowLogs,
  onShowGlossary,
  onShowSettings,
}) => {
  const { t } = useTranslation('ui');

  return (
    <PageHeader
      title={
        <>
          <span className="truncate">{title}</span>
          <span className="text-[10px] sm:text-xs font-medium text-brand-purple bg-brand-purple/5 border border-brand-purple/10 px-1.5 sm:px-2 py-0.5 rounded whitespace-nowrap shadow-sm">
            {modeLabel}
          </span>
        </>
      }
      subtitle={subtitleInfo}
      onBack={onBack}
      actions={
        <>
          <HeaderButton
            onClick={onToggleSnapshots}
            icon={<GitCommit className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
            label={t('header.history')}
            title={t('header.viewHistory')}
            highlighted={hasSnapshots}
          />
          <HeaderButton
            onClick={onShowLogs}
            icon={<FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
            label={t('header.logs')}
            title={t('header.viewLogs')}
            hoverColor="blue"
          />
          <HeaderButton
            onClick={onShowGlossary}
            icon={<Book className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
            label={t('header.glossary')}
            title={t('header.manageGlossary')}
            hoverColor="indigo"
          />
          <HeaderButton
            onClick={onShowSettings}
            icon={<Settings className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
            label={t('header.settings')}
            hoverColor="emerald"
          />
        </>
      }
    />
  );
};
