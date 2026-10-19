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
  it("revalidates again after invalidation during a pending request, coalescing repeated calls", async () => {
    const pending = Promise.withResolvers<Entry>();
    const fetchFromServer = vi
      .fn<(id: number) => Promise<Entry>>()
      .mockImplementationOnce(() => pending.promise)
      .mockResolvedValue({ id: 1, name: "new" });
    const cache = new FilesystemCache<number, Entry>({
      fetchFromIndexedDB: async () => undefined,
      fetchFromServer,
    });
    const loading = cache.get(1);
    await vi.waitFor(() => expect(fetchFromServer).toHaveBeenCalledTimes(1));

    cache.invalidate(1);
    cache.invalidate(1);
    cache.invalidate(1);
    pending.resolve({ id: 1, name: "old" });
    const entry = await loading;
    await vi.waitFor(() => expect(entry.name).toBe("new"));
    expect(fetchFromServer).toHaveBeenCalledTimes(2);
  });

  it("revalidates only invalidated entries after a pending bulk request", async () => {
    const pending = Promise.withResolvers<Map<number, Entry>>();
    const fetchFromServer = vi.fn(async (id: number) => ({ id, name: "new" }));
    const bulkFetchFromServer = vi.fn(() => pending.promise);
    const cache = new FilesystemCache<number, Entry>({
      fetchFromIndexedDB: async () => undefined,
      fetchFromServer,
      bulkFetchFromIndexedDB: async () => new Map(),
      bulkFetchFromServer,
    });
    const loading = cache.bulkGet(new Set([1, 2]));
    await vi.waitFor(() => expect(bulkFetchFromServer).toHaveBeenCalledTimes(1));
    cache.invalidate(1);
    pending.resolve(new Map([1, 2].map((id) => [id, { id, name: "old" }])));

    const entries = await loading;
    await vi.waitFor(() => expect(entries.get(1)?.name).toBe("new"));
    expect(entries.get(2)?.name).toBe("old");
    expect(fetchFromServer).toHaveBeenCalledTimes(1);
  });

  it("preserves invalidation when a pending request fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const pending = Promise.withResolvers<Entry>();
    const fetchFromServer = vi
      .fn<() => Promise<Entry>>()
      .mockImplementationOnce(() => pending.promise)
      .mockResolvedValue({ id: 1, name: "new" });
    const cache = new FilesystemCache<number, Entry>({
      fetchFromIndexedDB: async () => ({ id: 1, name: "local" }),
      fetchFromServer,
    });
    const entry = await cache.get(1);
    await vi.waitFor(() => expect(fetchFromServer).toHaveBeenCalledTimes(1));
    cache.invalidate(1);
    pending.reject(new Error("Failed"));

    await vi.waitFor(() => expect(entry.name).toBe("new"));
    expect(fetchFromServer).toHaveBeenCalledTimes(2);
  });

  it("doesn't revalidate evicted entries after a pending bulk request", async () => {
    const pending = Promise.withResolvers<Map<number, Entry>>();
    const fetchFromServer = vi.fn(async (id: number) => ({ id, name: "new" }));
    const bulkFetchFromServer = vi.fn(() => pending.promise);
    const cache = new FilesystemCache<number, Entry>({
      fetchFromIndexedDB: async () => undefined,
      fetchFromServer,
      bulkFetchFromIndexedDB: async () => new Map(),
      bulkFetchFromServer,
    });
    const loading = cache.bulkGet(new Set([1]));
    await vi.waitFor(() => expect(bulkFetchFromServer).toHaveBeenCalledTimes(1));
    cache.invalidate(1);
    cache.evict(1);
    const replacement = await cache.get(1);
    pending.resolve(new Map([[1, { id: 1, name: "old" }]]));
    await loading;
    await flush();

    expect(replacement.name).toBe("new");
    expect(fetchFromServer).toHaveBeenCalledTimes(1);
  });

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
