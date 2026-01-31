import { createContext, useContext } from 'react';
import { type BatchReplaceConfig } from '@/services/subtitle/batchReplace';

interface SearchReplaceContextValue {
  searchConfig: BatchReplaceConfig | null;
  showDiff: boolean;
  currentMatchId: string | null; // subtitleId:field format
}

const SearchReplaceContext = createContext<SearchReplaceContextValue>({
  searchConfig: null,
  showDiff: false,
  currentMatchId: null,
});

export const SearchReplaceProvider = SearchReplaceContext.Provider;

export function useSearchReplaceContext() {
  return useContext(SearchReplaceContext);
}
