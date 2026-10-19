/* eslint-disable svelte/prefer-svelte-reactivity -- Lookup tables of reactive entries */
import { untrack } from "svelte";

interface FilesystemCacheOptions<K, V> {
  fetchFromIndexedDB: (key: K) => Promise<V | undefined>;
  fetchFromServer: (key: K, cachedValue: V | undefined) => Promise<V>;
  bulkFetchFromIndexedDB?: (keys: Set<K>) => Promise<Map<K, V>>;
  bulkFetchFromServer?: (keys: Map<K, { cachedValue: V | undefined }>) => Promise<Map<K, V>>;
}

interface Entry<V> {
  value?: V;
  promise?: Promise<V>;
  isInvalidated: boolean;
}

// Caches filesystem entries as reactive objects which are updated in place, so that every view
// of an entry reflects its latest state. Values are first loaded from IndexedDB (if any) and then
// revalidated against the server.
export class FilesystemCache<K, V extends object> {
  private map = new Map<K, Entry<V>>();

  constructor(private readonly options: FilesystemCacheOptions<K, V>) {}

  private getOrCreateEntry(key: K) {
    let entry = this.map.get(key);
    if (!entry) {
      const newEntry: Entry<V> = $state({ isInvalidated: false });
      entry = newEntry;
      this.map.set(key, entry);
    }
    return entry;
  }

  private settle(entry: Entry<V>, value: V) {
    if (entry.value) {
      Object.assign(entry.value, value);
    } else {
      entry.value = value;
    }
    return entry.value!;
  }

  private finish(key: K, entry: Entry<V>) {
    entry.promise = undefined;
    // Mutations may invalidate the entry while it is being revalidated, in which case it is queried
    // again unless it was evicted or replaced in the meantime
    if (entry.isInvalidated && this.map.get(key) === entry) {
      void Promise.resolve(this.get(key)).catch(() => {});
    }
  }

  // Returns the cached value synchronously if available, and revalidates it in the background
  get(key: K, options?: { fetchFromServer?: (cachedValue: V | undefined) => Promise<V> }) {
    return untrack(() => {
      const entry = this.getOrCreateEntry(key);
      if (entry.promise) return entry.value ?? entry.promise;

      const { promise, resolve, reject } = Promise.withResolvers<V>();
      promise.catch(() => {}); // Rejections are handled by callers waiting for the promise
      entry.promise = promise;
      entry.isInvalidated = false;

      (async () => {
        let cachedValue = entry.value && ($state.snapshot(entry.value) as V);
        if (!cachedValue) {
          cachedValue = await this.options.fetchFromIndexedDB(key);
          if (cachedValue) {
            resolve(this.settle(entry, cachedValue));
          }
        }

        const loadedValue = await (options?.fetchFromServer?.(cachedValue) ??
          this.options.fetchFromServer(key, cachedValue));
        resolve(this.settle(entry, loadedValue));
      })()
        .catch((e) => {
          console.error(e);
          reject(e);
        })
        .finally(() => this.finish(key, entry));

      return entry.value ?? promise;
    });
  }

  bulkGet(keys: Set<K>) {
    return untrack(() => {
      const entries = new Map<K, Entry<V>>();
      const pending = new Map<K, PromiseWithResolvers<V>>();
      for (const key of keys) {
        const entry = this.getOrCreateEntry(key);
        entries.set(key, entry);
        if (entry.promise) continue;

        const resolvers = Promise.withResolvers<V>();
        resolvers.promise.catch(() => {});
        entry.promise = resolvers.promise;
        entry.isInvalidated = false;
        pending.set(key, resolvers);
      }

      const settleAll = (values: Map<K, V>) => {
        values.forEach((value, key) => {
          pending.get(key)?.resolve(this.settle(entries.get(key)!, value));
        });
      };

      (async () => {
        const pendingKeys = [...pending.keys()];
        settleAll(
          await this.options.bulkFetchFromIndexedDB!(
            new Set(pendingKeys.filter((key) => !entries.get(key)!.value)),
          ),
        );
        settleAll(
          await this.options.bulkFetchFromServer!(
            new Map(pendingKeys.map((key) => [key, { cachedValue: entries.get(key)!.value }])),
          ),
        );
      })()
        .catch((e) => {
          console.error(e);
          pending.forEach(({ reject }) => reject(e));
        })
        .finally(() => {
          pending.forEach((_, key) => this.finish(key, entries.get(key)!));
        });

      const makeResult = () => new Map([...entries].map(([key, entry]) => [key, entry.value!]));
      const waiting = [...entries.values()]
        .filter((entry) => !entry.value)
        .map((entry) => entry.promise!);
      return waiting.length > 0 ? Promise.all(waiting).then(makeResult) : makeResult();
    });
  }

  // Revalidates the entry if it has been loaded
  invalidate(key: K) {
    const entry = this.map.get(key);
    if (entry) {
      entry.isInvalidated = true;
      void Promise.resolve(this.get(key)).catch(() => {});
    }
  }

  evict(key: K) {
    this.map.delete(key);
  }
}
