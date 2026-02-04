import React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';

interface ActiveTask {
  type: string;
  description: string;
}

interface CloseConfirmModalProps {
  isOpen: boolean;
  tasks: ActiveTask[];
  onKeepRunning: () => void;
  onCloseAnyway: () => void;
}

export const CloseConfirmModal: React.FC<CloseConfirmModalProps> = ({
  isOpen,
  tasks,
  onKeepRunning,
  onCloseAnyway,
}) => {
  const { t } = useTranslation('app');

  return (
    <Modal
      isOpen={isOpen}
      onClose={onKeepRunning}
      maxWidth="md"
      zIndex={200}
      showCloseButton={false}
    >
      <div className="flex items-center space-x-3 mb-4">
        <div className="p-2 bg-amber-50 rounded-lg border border-amber-100">
          <AlertTriangle className="w-6 h-6 text-amber-500" />
        </div>
        <h3 className="text-lg font-bold text-slate-800">{t('closeConfirm.title')}</h3>
      </div>

      <p className="text-slate-600 mb-4">{t('closeConfirm.message')}</p>

      {/* Task list */}
      <div className="bg-slate-50 rounded-lg p-3 mb-4 border border-slate-200">
        <p className="text-sm font-medium text-slate-700 mb-2">{t('closeConfirm.activeTasks')}:</p>
        <ul className="space-y-1">
          {tasks.slice(0, 5).map((task, index) => (
            <li key={index} className="text-sm text-slate-600 flex items-start">
              <span className="text-amber-500 mr-2">•</span>
              <span className="truncate">{task.description}</span>
            </li>
          ))}
          {tasks.length > 5 && (
            <li className="text-sm text-slate-500 italic">
              {t('closeConfirm.andMore', { count: tasks.length - 5 })}
            </li>
          )}
        </ul>
      </div>

      <p className="text-sm text-slate-500 mb-6">{t('closeConfirm.warning')}</p>

      <div className="flex justify-end space-x-3">
        <button
          onClick={onCloseAnyway}
          className="px-4 py-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors text-sm font-medium"
        >
          {t('closeConfirm.closeAnyway')}
        </button>
        <button
          onClick={onKeepRunning}
          className="px-4 py-2 rounded-lg text-white text-sm font-medium transition-all shadow-md bg-brand-purple hover:bg-brand-purple/90 shadow-brand-purple/25"
        >
          {t('closeConfirm.keepRunning')}
        </button>
      </div>
    </Modal>
  );
};
