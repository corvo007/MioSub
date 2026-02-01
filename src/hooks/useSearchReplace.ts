import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { type SubtitleItem } from '@/types/subtitle';
import {
  type BatchReplaceConfig,
  createSearchRegex,
  executeSingleReplace,
  executeBatchReplace,
} from '@/services/subtitle/batchReplace';

// Performance limits
const MIN_SEARCH_LENGTH = 1;
const MAX_SUBTITLES_FOR_SHORT_PATTERN = 5000;
const REGEX_COMPILE_DEBOUNCE_MS = 300;

export interface SearchMatch {
  subtitleId: string;
  field: 'original' | 'translated';
  index: number; // Index in the subtitles array
}

export interface SearchReplaceState {
  searchPattern: string;
  replaceWith: string;
  isRegex: boolean;
  caseSensitive: boolean;
  isOpen: boolean;
}

export interface UseSearchReplaceReturn {
  // State
  state: SearchReplaceState;
  matches: SearchMatch[];
  currentMatchIndex: number;
  totalMatches: number;
  /** Error message when regex is invalid (only in regex mode) */
  regexError: string | null;

  // Actions
  setSearchPattern: (pattern: string) => void;
  setReplaceWith: (text: string) => void;
  setIsRegex: (value: boolean) => void;
  setCaseSensitive: (value: boolean) => void;
  setIsOpen: (value: boolean) => void;

  // Navigation
  goToNextMatch: () => SearchMatch | null;
  goToPrevMatch: () => SearchMatch | null;
  getCurrentMatch: () => SearchMatch | null;

  // Replace actions
  replaceCurrent: (subtitles: SubtitleItem[]) => SubtitleItem[] | null;
  replaceAll: (subtitles: SubtitleItem[]) => SubtitleItem[];

  // Helpers
  getConfig: () => BatchReplaceConfig;
  isMatch: (subtitleId: string, field: 'original' | 'translated') => boolean;
  getPreviewText: (text: string) => string;
}

export function useSearchReplace(subtitles: SubtitleItem[]): UseSearchReplaceReturn {
  const [state, setState] = useState<SearchReplaceState>({
    searchPattern: '',
    replaceWith: '',
    isRegex: false,
    caseSensitive: false,
    isOpen: false,
  });

  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);

  // Debounced search pattern for regex compilation (300ms delay)
  const [debouncedSearchPattern, setDebouncedSearchPattern] = useState('');
  const [regexError, setRegexError] = useState<string | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search pattern updates
  useEffect(() => {
    // Clear previous timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Clear error immediately when user starts typing (responsive feedback)
    if (state.searchPattern !== debouncedSearchPattern) {
      setRegexError(null);
    }

    // Set new timer
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedSearchPattern(state.searchPattern);
    }, REGEX_COMPILE_DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [state.searchPattern, debouncedSearchPattern]);

  // Build config from debounced state for matching
  const debouncedConfig: BatchReplaceConfig = useMemo(
    () => ({
      searchPattern: debouncedSearchPattern,
      replaceWith: state.replaceWith,
      isRegex: state.isRegex,
      caseSensitive: state.caseSensitive,
      targetField: 'both',
    }),
    [debouncedSearchPattern, state.replaceWith, state.isRegex, state.caseSensitive]
  );

  // Find all matches with performance protection and error handling
  const matches = useMemo(() => {
    if (!debouncedSearchPattern || debouncedSearchPattern.length < MIN_SEARCH_LENGTH) {
      setRegexError(null);
      return [];
    }

    // Skip search for very large datasets with short patterns (non-regex)
    if (
      !state.isRegex &&
      debouncedSearchPattern.length < 2 &&
      subtitles.length > MAX_SUBTITLES_FOR_SHORT_PATTERN
    ) {
      return [];
    }

    const result: SearchMatch[] = [];

    try {
      const regex = createSearchRegex(debouncedConfig);
      setRegexError(null);

      subtitles.forEach((sub, index) => {
        // Check original
        if (sub.original && regex.test(sub.original)) {
          result.push({ subtitleId: sub.id, field: 'original', index });
        }
        regex.lastIndex = 0;

        // Check translated
        if (sub.translated && regex.test(sub.translated)) {
          result.push({ subtitleId: sub.id, field: 'translated', index });
        }
        regex.lastIndex = 0;
      });
    } catch (e) {
      // Only show error in regex mode
      if (state.isRegex) {
        const message = e instanceof Error ? e.message : 'Invalid regex pattern';
        setRegexError(message);
      }
      return [];
    }

    return result;
  }, [subtitles, debouncedSearchPattern, state.isRegex, debouncedConfig]);

  // A2: Build O(1) lookup set for isMatch
  const matchSet = useMemo(() => {
    const set = new Set<string>();
    for (const m of matches) {
      set.add(`${m.subtitleId}:${m.field}`);
    }
    return set;
  }, [matches]);

  // Reset current index when matches change
  useEffect(() => {
    if (currentMatchIndex >= matches.length) {
      setCurrentMatchIndex(Math.max(0, matches.length - 1));
    }
  }, [matches.length, currentMatchIndex]);

  // Setters
  const setSearchPattern = useCallback((pattern: string) => {
    setState((s) => ({ ...s, searchPattern: pattern }));
    setCurrentMatchIndex(0);
  }, []);

  const setReplaceWith = useCallback((text: string) => {
    setState((s) => ({ ...s, replaceWith: text }));
  }, []);

  const setIsRegex = useCallback((value: boolean) => {
    setState((s) => ({ ...s, isRegex: value }));
    setCurrentMatchIndex(0);
  }, []);

  const setCaseSensitive = useCallback((value: boolean) => {
    setState((s) => ({ ...s, caseSensitive: value }));
    setCurrentMatchIndex(0);
  }, []);

  const setIsOpen = useCallback((value: boolean) => {
    setState((s) => ({ ...s, isOpen: value }));
  }, []);

  // Navigation
  const goToNextMatch = useCallback(() => {
    if (matches.length === 0) return null;
    const nextIndex = (currentMatchIndex + 1) % matches.length;
    setCurrentMatchIndex(nextIndex);
    return matches[nextIndex];
  }, [matches, currentMatchIndex]);

  const goToPrevMatch = useCallback(() => {
    if (matches.length === 0) return null;
    const prevIndex = (currentMatchIndex - 1 + matches.length) % matches.length;
    setCurrentMatchIndex(prevIndex);
    return matches[prevIndex];
  }, [matches, currentMatchIndex]);

  const getCurrentMatch = useCallback(() => {
    if (matches.length === 0) return null;
    return matches[currentMatchIndex] || null;
  }, [matches, currentMatchIndex]);

  // Build immediate config for replace actions (use actual searchPattern, not deferred)
  const immediateConfig: BatchReplaceConfig = useMemo(
    () => ({
      searchPattern: state.searchPattern,
      replaceWith: state.replaceWith,
      isRegex: state.isRegex,
      caseSensitive: state.caseSensitive,
      targetField: 'both',
    }),
    [state.searchPattern, state.replaceWith, state.isRegex, state.caseSensitive]
  );

  // Replace actions
  const replaceCurrent = useCallback(
    (subs: SubtitleItem[]) => {
      const match = getCurrentMatch();
      if (!match) return null;

      return subs.map((sub) => {
        if (sub.id !== match.subtitleId) return sub;
        return executeSingleReplace(sub, match.field, immediateConfig);
      });
    },
    [getCurrentMatch, immediateConfig]
  );

  const replaceAll = useCallback(
    (subs: SubtitleItem[]) => {
      return executeBatchReplace(subs, immediateConfig);
    },
    [immediateConfig]
  );

  // Helpers
  const getConfig = useCallback(() => immediateConfig, [immediateConfig]);

  // A2: O(1) lookup using Set
  const isMatch = useCallback(
    (subtitleId: string, field: 'original' | 'translated') => {
      return matchSet.has(`${subtitleId}:${field}`);
    },
    [matchSet]
  );

  const getPreviewText = useCallback(
    (text: string) => {
      if (!state.searchPattern || !text) return text;
      try {
        const regex = createSearchRegex(immediateConfig);
        return text.replace(regex, state.replaceWith);
      } catch {
        return text;
      }
    },
    [state.searchPattern, state.replaceWith, immediateConfig]
  );

  return {
    state,
    matches,
    currentMatchIndex,
    totalMatches: matches.length,
    regexError,
    setSearchPattern,
    setReplaceWith,
    setIsRegex,
    setCaseSensitive,
    setIsOpen,
    goToNextMatch,
    goToPrevMatch,
    getCurrentMatch,
    replaceCurrent,
    replaceAll,
    getConfig,
    isMatch,
    getPreviewText,
  };
}
