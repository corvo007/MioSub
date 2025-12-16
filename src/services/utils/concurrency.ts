/**
 * Concurrency Utilities
 * Uses p-map for parallel mapping and async-sema for semaphore control
 */
import pMap from 'p-map';
import { Sema } from 'async-sema';

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
 * Wrapper around async-sema's Sema to maintain existing API.
 */
export class Semaphore {
  private sema: Sema;

  constructor(max: number) {
    this.sema = new Sema(max);
  }

  async acquire(): Promise<void> {
    await this.sema.acquire();
  }

  release(): void {
    this.sema.release();
  }
}
