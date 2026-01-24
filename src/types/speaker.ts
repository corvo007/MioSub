export interface SpeakerUIProfile {
  id: string;
  name: string;
  color?: string;
  isStandard?: boolean; // true if standard diarization ("Speaker 1"), false if named person
  shortId?: string; // 2-char ID for export
}
