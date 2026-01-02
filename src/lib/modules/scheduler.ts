export class Scheduler<T = void> {
  private tasks = 0;
  private memoryUsage = 0;
  private queue: (() => void)[] = [];

  constructor(public memoryLimit = 100 * 1024 * 1024 /* 100 MiB */) {}

  private next() {
    if (this.memoryUsage < this.memoryLimit) {
      this.queue.shift()?.();
    }
  }

  async schedule(estimateMemoryUsage: () => Promise<number>, task: () => Promise<T>) {
    if (this.tasks++ > 0) {
      await new Promise<void>((resolve) => {
        this.queue.push(resolve);
      });
    }

    while (this.memoryUsage >= this.memoryLimit) {
      await new Promise<void>((resolve) => {
        this.queue.unshift(resolve);
      });
    }

    let taskMemoryUsage = 0;

    try {
      taskMemoryUsage = await estimateMemoryUsage();
      this.memoryUsage += taskMemoryUsage;
      this.next();

      return await task();
    } finally {
      this.tasks--;
      this.memoryUsage -= taskMemoryUsage;
      this.next();
    }
  }
}
