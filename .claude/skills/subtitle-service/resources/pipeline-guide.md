# Translation Pipeline Guide

## Pipeline Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Pipeline Controller                   │
├─────────────────────────────────────────────────────────┤
│  Transcription    │  Glossary    │  Refinement         │
│  Semaphore(1-5)   │  Extraction  │  Semaphore(5)       │
├─────────────────────────────────────────────────────────┤
│              Chunk Processing (Parallel)                 │
└─────────────────────────────────────────────────────────┘
```

## Chunk Processing

### Chunking Strategy

```typescript
interface ChunkConfig {
  maxDuration: number; // Max duration per chunk (ms)
  maxEntries: number; // Max entries per chunk
  overlapEntries: number; // Context overlap
}

export function createChunks(entries: SubtitleEntry[], config: ChunkConfig): SubtitleEntry[][] {
  const chunks: SubtitleEntry[][] = [];
  let currentChunk: SubtitleEntry[] = [];
  let currentDuration = 0;

  for (const entry of entries) {
    const duration = entry.endTime - entry.startTime;

    if (
      currentDuration + duration > config.maxDuration ||
      currentChunk.length >= config.maxEntries
    ) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentDuration = 0;
    }

    currentChunk.push(entry);
    currentDuration += duration;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}
```

## Parallel Processing

### mapInParallel

```typescript
export async function mapInParallel<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency: number = 5
): Promise<R[]> {
  const results: R[] = [];
  const executing: Promise<void>[] = [];

  for (let i = 0; i < items.length; i++) {
    const promise = fn(items[i], i).then((result) => {
      results[i] = result;
    });

    executing.push(promise);

    if (executing.length >= concurrency) {
      await Promise.race(executing);
      executing.splice(
        executing.findIndex((p) => p === promise),
        1
      );
    }
  }

  await Promise.all(executing);
  return results;
}
```

## Semaphore Pattern

```typescript
export class Semaphore {
  private permits: number;
  private waiting: (() => void)[] = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }

    return new Promise((resolve) => {
      this.waiting.push(resolve);
    });
  }

  release(): void {
    if (this.waiting.length > 0) {
      const resolve = this.waiting.shift()!;
      resolve();
    } else {
      this.permits++;
    }
  }
}
```

## Progress Tracking

```typescript
interface PipelineProgress {
  stage: 'transcription' | 'glossary' | 'translation' | 'complete';
  currentChunk: number;
  totalChunks: number;
  percent: number;
}

export function createProgressTracker(
  totalChunks: number,
  onProgress: (progress: PipelineProgress) => void
) {
  let completedChunks = 0;

  return {
    updateStage(stage: PipelineProgress['stage']) {
      onProgress({
        stage,
        currentChunk: completedChunks,
        totalChunks,
        percent: (completedChunks / totalChunks) * 100,
      });
    },

    completeChunk() {
      completedChunks++;
      onProgress({
        stage: 'translation',
        currentChunk: completedChunks,
        totalChunks,
        percent: (completedChunks / totalChunks) * 100,
      });
    },
  };
}
```

## Error Recovery

```typescript
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries: number;
    delay: number;
    backoff: number;
  }
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < options.maxRetries) {
        const waitTime = options.delay * Math.pow(options.backoff, attempt);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }
  }

  throw lastError!;
}
```
