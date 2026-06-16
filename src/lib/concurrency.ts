/**
 * Run `fn` over `items` with at most `limit` concurrent invocations,
 * preserving input order in the returned results array.
 */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let index = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const next = index;
      index += 1;
      if (next >= items.length) return;
      out[next] = await fn(items[next] as T, next);
    }
  }

  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker);
  await Promise.all(workers);
  return out;
}

/**
 * Create a semaphore that limits the number of concurrently running tasks.
 * Returns a function that wraps and schedules an async task.
 */
export function createSemaphore(max: number): <R>(fn: () => Promise<R>) => Promise<R> {
  let running = 0;
  const queue: Array<() => void> = [];

  const release = (): void => {
    running -= 1;
    const next = queue.shift();
    if (next) {
      running += 1;
      next();
    }
  };

  return async function run<R>(fn: () => Promise<R>): Promise<R> {
    await new Promise<void>((resolve) => {
      if (running < max) {
        running += 1;
        resolve();
      } else {
        queue.push(resolve);
      }
    });
    try {
      return await fn();
    } finally {
      release();
    }
  };
}
