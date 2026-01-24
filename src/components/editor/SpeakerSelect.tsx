import React from 'react';
import { ChevronDown, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@/store/useAppStore';
import { getSpeakerColorWithCustom } from '@/services/utils/colors';
import { cn } from '@/lib/cn';
import { useDropdown } from '@/hooks/useDropdown';

interface SpeakerSelectProps {
  currentSpeakerId?: string;
  onSelect: (speakerId: string) => void;
}

export const SpeakerSelect: React.FC<SpeakerSelectProps> = ({ currentSpeakerId, onSelect }) => {
  const { t } = useTranslation('modals');
  const speakerProfiles = useWorkspaceStore(useShallow((s) => s.speakerProfiles));
  const setShowSpeakerManager = useAppStore((s) => s.setShowSpeakerManager);
  const onManageSpeakers = () => setShowSpeakerManager(true);

  const {
    isOpen,
    setIsOpen,
    toggle: toggleOpen,
    triggerRef: dropdownRef,
    direction: { dropUp },
  } = useDropdown<HTMLDivElement>({
    minSpaceBelow: 250,
  });

  // Memoize currentProfile to avoid .find() on every render (Audit fix)
  // Memoize currentProfile to avoid .find() on every render (Audit fix)
  const currentProfile = React.useMemo(
    () => speakerProfiles.find((p) => p.id === currentSpeakerId),
    [speakerProfiles, currentSpeakerId]
  );
  const speakerColor = getSpeakerColorWithCustom(currentProfile?.name || '', currentProfile?.color);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={toggleOpen}
        className="flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium cursor-pointer hover:opacity-90 transition-opacity"
        style={{
          backgroundColor: speakerColor + '20',
          color: '#334155', // slate-700 for readability
          borderColor: speakerColor,
          borderWidth: '1px',
        }}
      >
        <span>{currentProfile?.name || t('speakerManager.selectSpeaker')}</span>
        <ChevronDown className={cn('w-3 h-3 transition-transform', isOpen && 'rotate-180')} />
      </button>

      {isOpen && (
        <div
          className={cn(
            'absolute left-0 bg-white/95 backdrop-blur-xl border border-slate-200/60 rounded-xl shadow-xl shadow-brand-purple/10 z-50 min-w-37.5 py-1.5 animate-fade-in ring-1 ring-slate-900/5',
            dropUp ? 'bottom-full mb-1 origin-bottom' : 'top-full mt-1 origin-top'
          )}
        >
          {speakerProfiles.length === 0 ? (
            <div className="px-3 py-2 text-xs text-slate-500">{t('speakerManager.noSpeakers')}</div>
          ) : (
            speakerProfiles.map((profile) => (
              <button
                key={profile.id}
                onClick={() => {
                  onSelect(profile.id);
                  setIsOpen(false);
                }}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-slate-50 transition-colors',
                  currentSpeakerId === profile.id
                    ? 'bg-brand-purple/5 text-brand-purple font-medium'
                    : 'text-slate-600 hover:text-slate-900'
                )}
              >
                <span
                  className="w-2 h-2 rounded-full ring-1 ring-slate-900/5"
                  style={{
                    backgroundColor: getSpeakerColorWithCustom(profile.name, profile.color),
                  }}
                />
                <span className="">{profile.name}</span>
              </button>
            ))
          )}

          {onManageSpeakers && (
            <>
              <div className="border-t border-slate-100 my-1" />
              <button
                onClick={() => {
                  onManageSpeakers();
                  setIsOpen(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-500 hover:text-brand-purple hover:bg-slate-50 transition-colors"
              >
                <Users className="w-3 h-3" />
                {t('speakerManager.manageSpeakers')}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};
