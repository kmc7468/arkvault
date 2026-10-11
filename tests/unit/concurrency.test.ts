import { describe, expect, it } from "vitest";
import { BoundedQueue, Scheduler } from "#lib/utils/concurrency/index.ts";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("BoundedQueue", () => {
  it("blocks producers while full", async () => {
    const queue = new BoundedQueue<number>(2);
    await queue.push(1);
    await queue.push(2);

    let isPushed = false;
    const pushing = queue.push(3).then(() => (isPushed = true));
    await tick();
    expect(isPushed).toBe(false);

    expect(await queue.pop()).toBe(1);
    await pushing;
    expect(isPushed).toBe(true);
  });

  it("drains remaining items and then returns null after closing", async () => {
    const queue = new BoundedQueue<number>(2);
    await queue.push(1);
    queue.close();

    expect(await queue.pop()).toBe(1);
    expect(await queue.pop()).toBeNull();
    await expect(queue.push(2)).rejects.toThrow("Queue closed");
  });

  it("wakes up waiting consumers when closed", async () => {
    const queue = new BoundedQueue<number>(1);
    const popping = queue.pop();
    queue.close();
    expect(await popping).toBeNull();
  });
});

describe("Scheduler", () => {
  it("defers tasks while the memory limit is exceeded", async () => {
    const scheduler = new Scheduler<void>(100);
    const events: string[] = [];

    let finishFirst!: () => void;
    const first = scheduler.schedule(100, async () => {
      events.push("first:start");
      await new Promise<void>((resolve) => (finishFirst = resolve));
      events.push("first:end");
    });
    const second = scheduler.schedule(10, async () => {
      events.push("second:start");
    });

    await tick();
    expect(events).toEqual(["first:start"]);

    finishFirst();
    await Promise.all([first, second]);
    expect(events).toEqual(["first:start", "first:end", "second:start"]);
  });

  it("runs small tasks concurrently", async () => {
    const scheduler = new Scheduler<number>(100);
    let running = 0;
    let maxRunning = 0;

    await Promise.all(
      [1, 2, 3].map((value) =>
        scheduler.schedule(10, async () => {
          maxRunning = Math.max(maxRunning, ++running);
          await tick();
          running--;
          return value;
        }),
      ),
    );

    expect(maxRunning).toBe(3);
  });

  it("releases memory when a task fails", async () => {
    const scheduler = new Scheduler<void>(100);
    await expect(
      scheduler.schedule(100, async () => {
        throw new Error("Failed");
      }),
    ).rejects.toThrow("Failed");

    await expect(scheduler.schedule(100, async () => {})).resolves.toBeUndefined();
  });
});
