export class Scheduler<T = void> {
  private isEstimating = false;
  private memoryUsage = 0;
  private queue: (() => void)[] = [];

  constructor(public readonly memoryLimit = 100 * 1024 * 1024 /* 100 MiB */) {}

  private next() {
    if (!this.isEstimating && this.memoryUsage < this.memoryLimit) {
      const resolve = this.queue.shift();
      if (resolve) {
        this.isEstimating = true;
        resolve();
      }
    }
  }

  async schedule(
    estimateMemoryUsage: number | (() => number | Promise<number>),
    task: () => Promise<T>,
  ) {
    if (this.isEstimating || this.memoryUsage >= this.memoryLimit) {
      await new Promise<void>((resolve) => {
        this.queue.push(resolve);
      });
    } else {
      this.isEstimating = true;
    }

    let taskMemoryUsage = 0;

    try {
      taskMemoryUsage =
        typeof estimateMemoryUsage === "number" ? estimateMemoryUsage : await estimateMemoryUsage();
      this.memoryUsage += taskMemoryUsage;
    } finally {
      this.isEstimating = false;
      this.next();
    }

    try {
      return await task();
    } finally {
      this.memoryUsage -= taskMemoryUsage;
      this.next();
    }
  }
}
