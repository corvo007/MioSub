import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';
import { GENRE_PRESETS, GENRE_LABELS } from '@/types/settings';
import { OptionButton } from '@/components/ui/OptionButton';
import { TextInput } from '@/components/ui/TextInput';

interface GenrePickerProps {
  currentGenre: string;
  onGenreChange: (genre: string) => void;
  columns?: 2 | 3;
  color?: 'violet' | 'indigo';
}

/**
 * Unified genre selection component with presets and custom input.
 * Manages internal state for custom input toggle and value.
 */
export const GenrePicker: React.FC<GenrePickerProps> = ({
  currentGenre,
  onGenreChange,
  columns = 3,
  color = 'violet',
}) => {
  const { t } = useTranslation('ui');
  const isCustom = !GENRE_PRESETS.includes(currentGenre);
  const [showCustomInput, setShowCustomInput] = useState(isCustom);
  const [customValue, setCustomValue] = useState(isCustom ? currentGenre : '');

  // Sync internal state when currentGenre prop changes (e.g., dialog reopens with different value)
  useEffect(() => {
    const isCurrentCustom = !GENRE_PRESETS.includes(currentGenre);
    setShowCustomInput(isCurrentCustom);
    setCustomValue(isCurrentCustom ? currentGenre : '');
  }, [currentGenre]);

  const handlePresetClick = (genre: string) => {
    setShowCustomInput(false);
    setCustomValue('');
    onGenreChange(genre);
  };

  const handleCustomClick = () => {
    setShowCustomInput(true);
  };

  const handleCustomChange = (value: string) => {
    setCustomValue(value);
    if (value.trim()) {
      onGenreChange(value.trim());
    }
  };

  const gridCols = columns === 2 ? 'grid-cols-2' : 'grid-cols-3';

  return (
    <>
      <div className={cn('grid gap-2', gridCols)}>
        {GENRE_PRESETS.map((genre) => (
          <OptionButton
            key={genre}
            selected={currentGenre === genre && !showCustomInput}
            onClick={() => handlePresetClick(genre)}
            color={color}
          >
            {GENRE_LABELS[genre] || genre}
          </OptionButton>
        ))}
        <OptionButton selected={showCustomInput} onClick={handleCustomClick} color={color}>
          {t('genrePicker.custom')}
        </OptionButton>
      </div>
      {showCustomInput && (
        <TextInput
          value={customValue}
          onChange={(e) => handleCustomChange(e.target.value)}
          placeholder={t('genrePicker.customPlaceholder')}
          variant="transparent"
          className="mt-2"
          autoFocus
        />
      )}
    </>
  );
};
