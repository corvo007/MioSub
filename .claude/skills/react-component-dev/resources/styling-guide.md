# TailwindCSS Styling Guide

## Basic Usage

Use TailwindCSS 4 with `clsx` and `tw-merge`:

```typescript
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Helper function (optional)
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

## Conditional Styles

```typescript
<button
  className={cn(
    // Base styles
    'px-4 py-2 rounded-lg font-medium transition-colors',
    // Conditional styles
    variant === 'primary' && 'bg-blue-500 text-white hover:bg-blue-600',
    variant === 'secondary' && 'bg-gray-200 text-gray-800 hover:bg-gray-300',
    // State styles
    disabled && 'opacity-50 cursor-not-allowed',
    isLoading && 'animate-pulse'
  )}
>
```

## Responsive Design

```typescript
<div className="
  grid
  grid-cols-1
  md:grid-cols-2
  lg:grid-cols-3
  gap-4
">
```

## Dark Mode

Use Tailwind's dark mode variant:

```typescript
<div className="
  bg-white dark:bg-gray-900
  text-gray-900 dark:text-white
  border border-gray-200 dark:border-gray-700
">
```

## Animation

```typescript
// Transition
<div className="transition-all duration-200 hover:scale-105">

// Animation
<div className="animate-spin">
<div className="animate-pulse">
<div className="animate-bounce">
```

## Common Patterns

### Cards

```typescript
<div className="rounded-lg bg-white dark:bg-gray-800 shadow-md p-4">
```

### Buttons

```typescript
// Primary
<button className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors">

// Ghost
<button className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
```

### Forms

```typescript
<input className="
  w-full px-3 py-2
  border border-gray-300 dark:border-gray-600
  rounded-lg
  focus:outline-none focus:ring-2 focus:ring-blue-500
  dark:bg-gray-800 dark:text-white
">
```
