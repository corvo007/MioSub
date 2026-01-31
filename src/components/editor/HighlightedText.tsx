import React, { useMemo } from 'react';
import { cn } from '@/lib/cn';
import { createSearchRegex, type BatchReplaceConfig } from '@/services/subtitle/batchReplace';

// A3: Performance limits to prevent catastrophic regex backtracking
const MAX_TEXT_LENGTH = 10000;
const MAX_MATCHES = 100;
const REGEX_TIMEOUT_MS = 50;

interface HighlightedTextProps {
  text: string;
  searchConfig: BatchReplaceConfig | null;
  showDiff?: boolean;
  className?: string;
}

interface TextSegment {
  text: string;
  type: 'normal' | 'match' | 'removed' | 'added';
}

/**
 * Highlights search matches in text, optionally showing diff preview
 */
export const HighlightedText: React.FC<HighlightedTextProps> = ({
  text,
  searchConfig,
  showDiff = false,
  className,
}) => {
  const segments = useMemo(() => {
    if (!text || !searchConfig?.searchPattern) {
      return [{ text, type: 'normal' as const }];
    }

    // A3: Skip highlighting for very long text to prevent performance issues
    if (text.length > MAX_TEXT_LENGTH) {
      return [{ text, type: 'normal' as const }];
    }

    try {
      const regex = createSearchRegex(searchConfig);
      const result: TextSegment[] = [];
      let lastIndex = 0;

      // Find all matches with timeout protection
      let match: RegExpExecArray | null;
      const matches: { start: number; end: number; matched: string; replacement: string }[] = [];
      const startTime = performance.now();

      while ((match = regex.exec(text)) !== null) {
        // A3: Timeout protection for catastrophic backtracking
        if (performance.now() - startTime > REGEX_TIMEOUT_MS) {
          console.warn('HighlightedText: regex timeout, skipping highlighting');
          return [{ text, type: 'normal' as const }];
        }

        // A3: Limit max matches to prevent memory issues
        if (matches.length >= MAX_MATCHES) {
          break;
        }

        // Save lastIndex before replace (replace resets it, causing infinite loop)
        const savedLastIndex = regex.lastIndex;

        // For replacement, handle capture groups if in regex mode
        let replacement: string;
        if (searchConfig.isRegex) {
          // Use a fresh regex for replacement to avoid lastIndex issues
          const replaceRegex = createSearchRegex(searchConfig);
          replacement = match[0].replace(replaceRegex, searchConfig.replaceWith);
        } else {
          // Plain text mode: direct replacement
          replacement = searchConfig.replaceWith;
        }

        matches.push({
          start: match.index,
          end: match.index + match[0].length,
          matched: match[0],
          replacement,
        });

        // Restore lastIndex
        regex.lastIndex = savedLastIndex;

        // Prevent infinite loop for zero-length matches
        if (match[0].length === 0) {
          regex.lastIndex++;
        }
      }

      // Build segments
      for (const m of matches) {
        // Add normal text before match
        if (m.start > lastIndex) {
          result.push({ text: text.slice(lastIndex, m.start), type: 'normal' });
        }

        if (showDiff) {
          // Show diff: removed (original) + added (replacement)
          result.push({ text: m.matched, type: 'removed' });
          if (m.replacement) {
            result.push({ text: m.replacement, type: 'added' });
          }
        } else {
          // Just highlight the match
          result.push({ text: m.matched, type: 'match' });
        }

        lastIndex = m.end;
      }

      // Add remaining text
      if (lastIndex < text.length) {
        result.push({ text: text.slice(lastIndex), type: 'normal' });
      }

      return result.length > 0 ? result : [{ text, type: 'normal' as const }];
    } catch {
      // Invalid regex
      return [{ text, type: 'normal' as const }];
    }
  }, [text, searchConfig, showDiff]);

  if (segments.length === 1 && segments[0].type === 'normal') {
    return <span className={className}>{text}</span>;
  }

  return (
    <span className={className}>
      {segments.map((seg, i) => (
        <span
          key={i}
          className={cn(
            seg.type === 'match' && 'bg-yellow-200 text-yellow-900 rounded-sm px-0.5',
            seg.type === 'removed' && 'bg-red-200 text-red-800 line-through',
            seg.type === 'added' && 'bg-green-200 text-green-800'
          )}
        >
          {seg.text}
        </span>
      ))}
    </span>
  );
};

export default HighlightedText;
