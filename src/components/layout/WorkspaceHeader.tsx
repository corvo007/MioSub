import React from 'react';
import { GitCommit, FileText, Book, Settings } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageHeader, HeaderButton } from './PageHeader';
import { useAppStore } from '@/store/useAppStore';

interface WorkspaceHeaderProps {
  title: string;
  modeLabel: string;
  subtitleInfo: string;
  onBack: () => void;
  showSnapshots: boolean;
  onToggleSnapshots: () => void;
  hasSnapshots: boolean;
}

export const WorkspaceHeader: React.FC<WorkspaceHeaderProps> = ({
  title,
  modeLabel,
  subtitleInfo,
  onBack,
  showSnapshots,
  onToggleSnapshots,
  hasSnapshots,
}) => {
  const { t } = useTranslation('ui');

  // Store actions
  const setShowLogs = useAppStore((s) => s.setShowLogs);
  const setShowGlossaryManager = useAppStore((s) => s.setShowGlossaryManager);
  const setShowSettings = useAppStore((s) => s.setShowSettings);

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
