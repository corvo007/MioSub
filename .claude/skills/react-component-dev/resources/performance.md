# Performance Optimization

## Memoization

### useMemo for Expensive Calculations

```typescript
import { useMemo } from 'react';

function SubtitleList({ entries, searchQuery }: Props) {
  const filteredEntries = useMemo(() => {
    return entries.filter(entry =>
      entry.text.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [entries, searchQuery]);

  return <div>{/* ... */}</div>;
}
```

### useCallback for Callbacks

```typescript
import { useCallback } from 'react';

function SubtitleEditor({ entries, onUpdate }: Props) {
  const handleUpdate = useCallback((index: number, text: string) => {
    onUpdate(index, { ...entries[index], text });
  }, [entries, onUpdate]);

  return <div>{/* ... */}</div>;
}
```

### React.memo for Components

```typescript
import { memo } from 'react';

interface SubtitleRowProps {
  entry: SubtitleEntry;
  onEdit: (entry: SubtitleEntry) => void;
}

export const SubtitleRow = memo(function SubtitleRow({ entry, onEdit }: SubtitleRowProps) {
  return (
    <div className="flex items-center">
      {/* ... */}
    </div>
  );
});
```

## Virtualization

For long lists, use virtualization:

```typescript
import { useVirtualizer } from '@tanstack/react-virtual';

function VirtualizedSubtitleList({ entries }: Props) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48,
  });

  return (
    <div ref={parentRef} className="h-[400px] overflow-auto">
      <div style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((virtualRow) => (
          <SubtitleRow
            key={virtualRow.key}
            entry={entries[virtualRow.index]}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualRow.start}px)`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
```

## Code Splitting

Use lazy loading for large components:

```typescript
import { lazy, Suspense } from 'react';

const SettingsPanel = lazy(() => import('@components/settings/SettingsPanel'));

function App() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <SettingsPanel />
    </Suspense>
  );
}
```

## Avoiding Re-renders

### Stable References

```typescript
// ❌ Creates new object every render
<Component style={{ color: 'red' }} />

// ✅ Stable reference
const style = useMemo(() => ({ color: 'red' }), []);
<Component style={style} />
```

### Event Handler Optimization

```typescript
// ❌ Creates new function every render
{entries.map((entry, i) => (
  <SubtitleRow onClick={() => handleClick(i)} />
))}

// ✅ Pass index, handle in child
{entries.map((entry, i) => (
  <SubtitleRow index={i} onClick={handleClick} />
))}
```

## Debouncing

```typescript
import { useDeferredValue } from 'react';

function SearchableList({ entries }: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const deferredQuery = useDeferredValue(searchQuery);

  const filteredEntries = useMemo(() => {
    return entries.filter(entry =>
      entry.text.includes(deferredQuery)
    );
  }, [entries, deferredQuery]);

  return <div>{/* ... */}</div>;
}
```
