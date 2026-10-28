/** Serializes async tasks so consecutive starts are at least `intervalMs` apart. */
export class RateLimitedQueue {
  private tail: Promise<unknown> = Promise.resolve();
  private lastStart = -Infinity;

  constructor(
    private readonly intervalMs: number,
    private readonly now: () => number = () => Date.now(),
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  /** Runs `task` after every earlier task has started and the interval has passed. */
  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(async () => {
      const wait = this.lastStart + this.intervalMs - this.now();
      if (wait > 0) await this.sleep(wait);
      this.lastStart = this.now();
      return task();
    });
    // The next task waits for this one to start (and settle), whether it succeeds or fails.
    this.tail = result.catch(() => undefined);
    return result;
  }
}
