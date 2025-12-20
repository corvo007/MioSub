import React from 'react';
import { ChevronDown, Users } from 'lucide-react';
import { type SpeakerUIProfile } from '@/types/speaker';
import { getSpeakerColor } from '@/services/utils/colors';
import { cn } from '@/lib/cn';
import { useDropdownDirection } from '@/hooks/useDropdownDirection';

interface SpeakerSelectProps {
  currentSpeaker?: string;
  speakerProfiles: SpeakerUIProfile[];
  onSelect: (speaker: string) => void;
  onManageSpeakers?: () => void;
}

export const SpeakerSelect: React.FC<SpeakerSelectProps> = ({
  currentSpeaker,
  speakerProfiles,
  onSelect,
  onManageSpeakers,
}) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [dropUp, setDropUp] = React.useState(false);
  const { ref: dropdownRef, getDirection } = useDropdownDirection<HTMLDivElement>({
    minSpaceBelow: 250, // 保持原有阈值
  });

  const toggleOpen = () => {
    if (!isOpen) {
      const { dropUp: shouldDropUp } = getDirection();
      setDropUp(shouldDropUp);
    }
    setIsOpen(!isOpen);
  };

  // Close on outside click
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dropdownRef]);

  const speakerColor = getSpeakerColor(currentSpeaker || '');

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={toggleOpen}
        className="flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium cursor-pointer hover:opacity-90 transition-opacity"
        style={{
          backgroundColor: speakerColor + '20',
          color: speakerColor,
          border: `1px solid ${speakerColor}`,
        }}
      >
        <span>{currentSpeaker || '选择说话人'}</span>
        <ChevronDown className={cn('w-3 h-3 transition-transform', isOpen && 'rotate-180')} />
      </button>

      {isOpen && (
        <div
          className={cn(
            'absolute left-0 bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-50 min-w-[150px] py-1 animate-fade-in',
            dropUp ? 'bottom-full mb-1 origin-bottom' : 'top-full mt-1 origin-top'
          )}
        >
          {speakerProfiles.length === 0 ? (
            <div className="px-3 py-2 text-xs text-slate-500">暂无说话人</div>
          ) : (
            speakerProfiles.map((profile) => (
              <button
                key={profile.id}
                onClick={() => {
                  onSelect(profile.name);
                  setIsOpen(false);
                }}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-slate-800 transition-colors',
                  currentSpeaker === profile.name && 'bg-slate-800'
                )}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: getSpeakerColor(profile.name) }}
                />
                <span className="text-slate-200">{profile.name}</span>
              </button>
            ))
          )}

          {onManageSpeakers && (
            <>
              <div className="border-t border-slate-700 my-1" />
              <button
                onClick={() => {
                  onManageSpeakers();
                  setIsOpen(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <Users className="w-3 h-3" />
                管理说话人
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};
