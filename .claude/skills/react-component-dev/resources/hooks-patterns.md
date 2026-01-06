# Custom Hooks Patterns

## Hook Naming

Always prefix with `use`:

```typescript
// ✅ Good
useSubtitleParser();
useWorkspaceState();
useTranscription();

// ❌ Bad
subtitleParser();
getWorkspace();
```

## Location

Place hooks in `src/hooks/`:

```
src/hooks/
├── useWorkspaceLogic.ts      # Main workspace state
├── useSubtitleParser.ts      # Subtitle parsing
├── useTranscription.ts       # Transcription logic
└── useLocalStorage.ts        # Local storage wrapper
```

## Basic Hook Pattern

```typescript
import { useState, useCallback } from 'react';

export function useSubtitleEditor(initialEntries: SubtitleEntry[]) {
  const [entries, setEntries] = useState(initialEntries);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const updateEntry = useCallback((index: number, update: Partial<SubtitleEntry>) => {
    setEntries((prev) => prev.map((entry, i) => (i === index ? { ...entry, ...update } : entry)));
  }, []);

  const deleteEntry = useCallback((index: number) => {
    setEntries((prev) => prev.filter((_, i) => i !== index));
    setSelectedIndex(null);
  }, []);

  return {
    entries,
    selectedIndex,
    setSelectedIndex,
    updateEntry,
    deleteEntry,
  };
}
```

## Effect Hook Pattern

```typescript
import { useEffect, useRef } from 'react';

export function useAutoSave(data: unknown, onSave: (data: unknown) => void) {
  const timeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    // Clear previous timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set new timeout
    timeoutRef.current = setTimeout(() => {
      onSave(data);
    }, 1000);

    // Cleanup
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [data, onSave]);
}
```

## Context Hook Pattern

```typescript
import { createContext, useContext } from 'react';

interface WorkspaceContextValue {
  entries: SubtitleEntry[];
  updateEntry: (index: number, entry: SubtitleEntry) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within WorkspaceProvider');
  }
  return context;
}
```

## Async Hook Pattern

```typescript
import { useState, useCallback } from 'react';

export function useAsync<T>() {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const execute = useCallback(async (asyncFn: () => Promise<T>) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await asyncFn();
      setData(result);
      return result;
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { data, error, isLoading, execute };
}
```
