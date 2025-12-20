import { type SubtitleItem } from '@/types/subtitle';

export interface WorkspaceHistory {
  id: string;
  filePath: string;
  fileName: string;
  subtitles: SubtitleItem[];
  savedAt: string;
}
