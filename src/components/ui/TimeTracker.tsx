import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { type GenerationStatus } from '@/types/api';
import { formatDuration } from '@/services/subtitle/time';

interface TimeTrackerProps {
  startTime: number;
  completed: number;
  total: number;
  status: GenerationStatus;
}

export const TimeTracker: React.FC<TimeTrackerProps> = ({
  startTime,
  completed,
  total,
  status,
}) => {
  const { t } = useTranslation('ui');
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!startTime) return null;

  const elapsed = Math.floor((now - startTime) / 1000);

  return (
    <div className="flex justify-between text-xs text-slate-400 mb-4 px-1">
      <span>{t('timeTracker.elapsed', { time: formatDuration(elapsed) })}</span>
    </div>
  );
};
