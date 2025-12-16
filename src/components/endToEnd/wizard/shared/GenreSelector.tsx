import React from 'react';
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
  return (
    <div className="p-4 bg-white/5 border border-white/10 rounded-xl">
      <label className="block text-sm font-medium text-white/80 mb-3">
        <Film className="w-4 h-4 inline mr-2" />
        内容类型
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
