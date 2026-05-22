// backend/src/ai/utils/p-limit.ts
// Minimal concurrency limiter. Returns a function that, when called with an
// async task factory, runs the task subject to the cap and resolves with its result.
export function pLimit(concurrency: number) {
  if (concurrency < 1) throw new Error('pLimit: concurrency must be >= 1');
  let active = 0;
  const queue: Array<() => void> = [];

  const next = () => {
    if (active >= concurrency) return;
    const job = queue.shift();
    if (job) {
      active++;
      job();
    }
  };

  return function run<T>(factory: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      queue.push(() => {
        factory()
          .then(resolve, reject)
          .finally(() => {
            active--;
            next();
          });
      });
      next();
    });
  };
}
