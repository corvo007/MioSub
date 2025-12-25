import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Clapperboard } from 'lucide-react';
import { GENRE_PRESETS } from '@/types/settings';
import { Modal } from '@/components/ui/Modal';
import { GenrePicker } from '@/components/ui/GenrePicker';
import { PrimaryButton } from '@/components/ui/PrimaryButton';

interface GenreSettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  currentGenre: string;
  onSave: (genre: string) => void;
}

export const GenreSettingsDialog: React.FC<GenreSettingsDialogProps> = ({
  isOpen,
  onClose,
  currentGenre,
  onSave,
}) => {
  const { t } = useTranslation('ui');
  const [tempGenre, setTempGenre] = useState(currentGenre);

  useEffect(() => {
    if (isOpen) {
      setTempGenre(currentGenre);
    }
  }, [isOpen, currentGenre]);

  const handleSave = () => {
    onSave(tempGenre);
    onClose();
  };

  // Check if current selection is valid (either preset or custom with value)
  const isValidSelection = GENRE_PRESETS.includes(tempGenre) || tempGenre.trim().length > 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('genreSettings.title')}
      icon={<Clapperboard className="w-5 h-5" />}
      maxWidth="md"
    >
      <div className="space-y-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            {t('genreSettings.selectPreset')}
          </label>
          <GenrePicker
            currentGenre={tempGenre}
            onGenreChange={setTempGenre}
            columns={2}
            color="indigo"
          />
        </div>
      </div>
      <div className="flex justify-end">
        <PrimaryButton onClick={handleSave} disabled={!isValidSelection}>
          {t('genreSettings.saveChanges')}
        </PrimaryButton>
      </div>
    </Modal>
  );
};
