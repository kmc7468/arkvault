export class BoundedQueue<T> {
  private isClosed = false;
  private reservedCount = 0;
  private items: T[] = [];

  private waitersNotFull: (() => void)[] = [];
  private waitersNotEmpty: (() => void)[] = [];

  constructor(private readonly maxSize: number) {}

  async push(item: T) {
    if (this.isClosed) {
      throw new Error("Queue closed");
    }

    while (this.reservedCount >= this.maxSize) {
      await new Promise<void>((resolve) => this.waitersNotFull.push(resolve));
      if (this.isClosed) throw new Error("Queue closed");
    }

    this.reservedCount++;
    this.items.push(item);
    this.waitersNotEmpty.shift()?.();
  }

  async pop() {
    while (this.items.length === 0) {
      if (this.isClosed) return null;
      await new Promise<void>((resolve) => this.waitersNotEmpty.push(resolve));
    }

    const item = this.items.shift()!;
    this.reservedCount--;
    this.waitersNotFull.shift()?.();

    return item;
  }

  close() {
    this.isClosed = true;
    while (this.waitersNotEmpty.length > 0) this.waitersNotEmpty.shift()!();
    while (this.waitersNotFull.length > 0) this.waitersNotFull.shift()!();
  }
}
