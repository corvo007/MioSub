/**
 * Concurrency Utilities
 * Uses p-map for parallel mapping with custom Semaphore implementation
 */
import pMap from 'p-map';

/**
 * Map over items with limited concurrency.
 * Wrapper around p-map to maintain existing API.
 */
export async function mapInParallel<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
  signal?: AbortSignal
): Promise<R[]> {
  return pMap(items, fn, { concurrency, signal });
}

/**
 * Semaphore for controlling concurrent access to resources.
 * Custom implementation for browser compatibility.
 */
export class Semaphore {
  private tasks: (() => void)[] = [];
  private count: number;

  constructor(public max: number) {
    this.count = max;
  }

  async acquire(): Promise<void> {
    if (this.count > 0) {
      this.count--;
      return;
    }

    return new Promise<void>((resolve) => {
      this.tasks.push(resolve);
    });
  }

  release(): void {
    if (this.tasks.length > 0) {
      const next = this.tasks.shift();
      if (next) next();
    } else {
      this.count++;
    }
  }
}
