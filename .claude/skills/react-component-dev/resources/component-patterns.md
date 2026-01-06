# Component Design Patterns

## Functional Components Only

Always use functional components with hooks:

```typescript
// ✅ Functional component
export function SubtitleRow({ entry, onEdit }: SubtitleRowProps) {
  const [isEditing, setIsEditing] = useState(false);

  return (
    <div className="flex items-center gap-2">
      {/* ... */}
    </div>
  );
}
```

## Composition Pattern

Prefer composition over prop drilling:

```typescript
// ✅ Composition
<SubtitleEditor>
  <SubtitleEditor.Header>
    <SubtitleEditor.Title />
    <SubtitleEditor.Actions />
  </SubtitleEditor.Header>
  <SubtitleEditor.Content entries={entries} />
</SubtitleEditor>
```

## Controlled vs Uncontrolled

### Controlled (Recommended for forms)

```typescript
interface InputProps {
  value: string;
  onChange: (value: string) => void;
}

export function TextInput({ value, onChange }: InputProps) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
```

### Uncontrolled (For simple cases)

```typescript
export function FileDropzone({ onDrop }: DropzoneProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  // ...
}
```

## Error Boundaries

Wrap critical components with error boundaries:

```typescript
import { ErrorBoundary } from 'react-error-boundary';

<ErrorBoundary fallback={<ErrorFallback />}>
  <SubtitleEditor entries={entries} />
</ErrorBoundary>
```

## Loading States

Use Suspense for async components:

```typescript
import { Suspense } from 'react';

<Suspense fallback={<LoadingSpinner />}>
  <SubtitlePreview entries={entries} />
</Suspense>
```
