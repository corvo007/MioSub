import { useTranslation } from 'react-i18next';
import { Film } from 'lucide-react';
import { GenrePicker } from '@/components/ui/GenrePicker';

/**
 * Genre selector with Card container.
 * Uses GenrePicker internally.
 */
export function GenreSelector({
  currentGenre,
  onGenreChange,
}: {
  currentGenre: string;
  onGenreChange: (genre: string) => void;
}) {
  const { t } = useTranslation('endToEnd');
  return (
    <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
      <label className="block text-sm font-medium text-slate-700 mb-3">
        <Film className="w-4 h-4 inline mr-2 text-slate-500" />
        {t('config.subtitle.genre')}
      </label>
      <GenrePicker
        currentGenre={currentGenre}
        onGenreChange={onGenreChange}
        columns={3}
        color="violet"
      />
    </div>
  );
}

/**
 * Inline genre selector without container.
 * Uses GenrePicker internally.
 */
export function GenreSelectorInline({
  currentGenre,
  onGenreChange,
}: {
  currentGenre: string;
  onGenreChange: (genre: string) => void;
}) {
  return (
    <GenrePicker
      currentGenre={currentGenre}
      onGenreChange={onGenreChange}
      columns={3}
      color="violet"
    />
  );
}
