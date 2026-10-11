import { describe, expect, it, vi } from "vitest";
import { FilesystemCache } from "#lib/features/filesystem/cache.svelte.ts";

interface Entry {
  id: number;
  name: string;
}

const createCache = (options?: {
  local?: Record<number, string>;
  server?: Record<number, string>;
}) => {
  const local = options?.local ?? {};
  const server = options?.server ?? {};
  const fetchFromServer = vi.fn(async (id: number): Promise<Entry> => {
    if (!(id in server)) throw new Error("Not found");
    return { id, name: server[id]! };
  });
  const cache = new FilesystemCache<number, Entry>({
    fetchFromIndexedDB: async (id) => (id in local ? { id, name: local[id]! } : undefined),
    fetchFromServer,
    bulkFetchFromIndexedDB: async (ids) =>
      new Map([...ids].filter((id) => id in local).map((id) => [id, { id, name: local[id]! }])),
    bulkFetchFromServer: async (ids) =>
      new Map([...ids.keys()].map((id) => [id, { id, name: server[id]! }])),
  });
  return { cache, server, fetchFromServer };
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("FilesystemCache", () => {
  it("resolves with the local value first and updates it in place", async () => {
    const { cache } = createCache({ local: { 1: "local" }, server: { 1: "server" } });

    const entry = await cache.get(1);
    expect(entry.name).toBe("local");

    await flush();
    expect(entry.name).toBe("server");
  });

  it("returns the cached value synchronously", async () => {
    const { cache } = createCache({ server: { 1: "server" } });

    const entry = await cache.get(1);
    await flush();

    expect(cache.get(1)).toBe(entry);
  });

  it("revalidates entries when invalidated", async () => {
    const { cache, server, fetchFromServer } = createCache({ server: { 1: "old" } });
    const entry = await cache.get(1);
    await flush();

    server[1] = "new";
    cache.invalidate(1);
    await flush();

    expect(fetchFromServer).toHaveBeenCalledTimes(2);
    expect(entry.name).toBe("new");
  });

  it("ignores invalidation of entries that haven't been loaded", () => {
    const { cache, fetchFromServer } = createCache();

    cache.invalidate(1);

    expect(fetchFromServer).not.toHaveBeenCalled();
  });

  it("rejects if loading fails without a cached value", async () => {
    const { cache } = createCache();
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(cache.get(1)).rejects.toThrow("Not found");
    // Can be retried
    await expect(cache.get(1)).rejects.toThrow("Not found");
  });

  it("loads multiple entries at once", async () => {
    const { cache } = createCache({ local: { 1: "local" }, server: { 1: "a", 2: "b" } });

    const entries = await cache.bulkGet(new Set([1, 2]));
    await flush();

    expect(entries.get(1)?.name).toBe("a");
    expect(entries.get(2)?.name).toBe("b");
    expect(cache.get(2)).toBe(entries.get(2));
  });
});
