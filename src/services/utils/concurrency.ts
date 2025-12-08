export async function mapInParallel<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
  signal?: AbortSignal
): Promise<R[]> {
  const results: R[] = new Array(items.length);

  // Use queue to avoid race condition
  const tasks = items.map((item, index) => ({ item, index }));

  const worker = async () => {
    while (tasks.length > 0) {
      // Check cancellation BEFORE processing
      if (signal?.aborted) {
        throw new Error('操作已取消');
      }

      const task = tasks.shift(); // Atomic operation
      if (!task) break;

      results[task.index] = await fn(task.item, task.index);
    }
  };

  const workers = Array(Math.min(items.length, concurrency))
    .fill(null)
    .map(() => worker());

  await Promise.all(workers);
  return results;
}

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
