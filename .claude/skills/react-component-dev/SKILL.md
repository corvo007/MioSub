---
name: react-component-dev
description: React/TypeScript component development guidelines for Gemini-Subtitle-Pro. Use when creating components, pages, modals, forms, or working with TailwindCSS, hooks, and React 19 patterns. Covers component architecture, styling with Tailwind, state management, performance optimization, and accessibility.
---

# React Component Development Guidelines

## Purpose

Establish consistency and best practices for React components in Gemini-Subtitle-Pro using React 19, TypeScript 5.8, and TailwindCSS 4.

## When to Use This Skill

Automatically activates when working on:

- Creating or modifying React components
- Building pages, modals, dialogs, forms
- Styling with TailwindCSS
- Working with React hooks
- Implementing state management
- Performance optimization

---

## Quick Start

### New Component Checklist

- [ ] **Location**: Place in `src/components/[feature]/`
- [ ] **TypeScript**: Define proper props interface
- [ ] **Styling**: Use TailwindCSS with `clsx` and `tw-merge`
- [ ] **Path Aliases**: Use `@components/*`, `@hooks/*`, etc.
- [ ] **State**: Use appropriate state pattern (local, context, etc.)
- [ ] **i18n**: Use `useTranslation` for all user-facing text

---

## Component Architecture

### File Organization

```
src/components/
├── common/              # Shared components (Button, Modal, etc.)
├── layout/              # Layout components (Header, Sidebar, etc.)
├── subtitle/            # Subtitle-related components
├── settings/            # Settings components
├── workspace/           # Workspace components
└── [feature]/           # Feature-specific components
```

### Naming Conventions

- **Components**: `PascalCase` - `SubtitleEditor.tsx`
- **Hooks**: `camelCase` with `use` prefix - `useSubtitleParser.ts`
- **Utils**: `camelCase` - `formatTimestamp.ts`

---

## Core Principles

### 1. Always Use Path Aliases

```typescript
// ❌ NEVER: Relative paths
import { Button } from '../../components/common/Button';

// ✅ ALWAYS: Path aliases
import { Button } from '@components/common/Button';
import { useWorkspace } from '@hooks/useWorkspace';
import { SubtitleEntry } from '@types/subtitle';
```

### 2. Define Props Interface

```typescript
// ✅ ALWAYS: Clear prop types
interface SubtitleEditorProps {
  entries: SubtitleEntry[];
  onUpdate: (index: number, entry: SubtitleEntry) => void;
  isReadOnly?: boolean;
}

export function SubtitleEditor({ entries, onUpdate, isReadOnly = false }: SubtitleEditorProps) {
  // ...
}
```

### 3. Use TailwindCSS with clsx

```typescript
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// ✅ Conditional classes
<div className={twMerge(clsx(
  'rounded-lg p-4',
  isActive && 'bg-blue-500 text-white',
  isDisabled && 'opacity-50 cursor-not-allowed'
))}>
```

### 4. Use i18n for All Text

```typescript
import { useTranslation } from 'react-i18next';

export function SettingsPanel() {
  const { t } = useTranslation();

  return (
    <h1>{t('settings.title')}</h1>
  );
}
```

---

## Resource Files

For detailed guidelines, see the resources directory:

- [component-patterns.md](resources/component-patterns.md) - Component design patterns
- [styling-guide.md](resources/styling-guide.md) - TailwindCSS styling patterns
- [hooks-patterns.md](resources/hooks-patterns.md) - Custom hooks patterns
- [performance.md](resources/performance.md) - Performance optimization
