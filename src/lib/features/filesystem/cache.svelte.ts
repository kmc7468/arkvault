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
      const newEntry: Entry<V> = $state({});
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

  // Returns the cached value synchronously if available, and revalidates it in the background
  get(key: K, options?: { fetchFromServer?: (cachedValue: V | undefined) => Promise<V> }) {
    return untrack(() => {
      const entry = this.getOrCreateEntry(key);
      if (entry.promise) return entry.value ?? entry.promise;

      const { promise, resolve, reject } = Promise.withResolvers<V>();
      promise.catch(() => {}); // Rejections are handled by callers waiting for the promise
      entry.promise = promise;

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
        .finally(() => {
          entry.promise = undefined;
        });

      return entry.value ?? promise;
    });
  }

  bulkGet(keys: Set<K>) {
    return untrack(() => {
      const pending = new Map<K, PromiseWithResolvers<V>>();
      for (const key of keys) {
        const entry = this.getOrCreateEntry(key);
        if (entry.promise) continue;

        const resolvers = Promise.withResolvers<V>();
        resolvers.promise.catch(() => {});
        entry.promise = resolvers.promise;
        pending.set(key, resolvers);
      }

      const settleAll = (values: Map<K, V>) => {
        values.forEach((value, key) => {
          pending.get(key)?.resolve(this.settle(this.map.get(key)!, value));
        });
      };

      (async () => {
        const pendingKeys = [...pending.keys()];
        settleAll(
          await this.options.bulkFetchFromIndexedDB!(
            new Set(pendingKeys.filter((key) => !this.map.get(key)!.value)),
          ),
        );
        settleAll(
          await this.options.bulkFetchFromServer!(
            new Map(pendingKeys.map((key) => [key, { cachedValue: this.map.get(key)!.value }])),
          ),
        );
      })()
        .catch((e) => {
          console.error(e);
          pending.forEach(({ reject }) => reject(e));
        })
        .finally(() => {
          pending.forEach((_, key) => {
            this.map.get(key)!.promise = undefined;
          });
        });

      const makeResult = () => new Map([...keys].map((key) => [key, this.map.get(key)!.value!]));
      const waiting = [...keys]
        .map((key) => this.map.get(key)!)
        .filter((entry) => !entry.value)
        .map((entry) => entry.promise!);
      return waiting.length > 0 ? Promise.all(waiting).then(makeResult) : makeResult();
    });
  }

  // Revalidates the entry if it has been loaded
  invalidate(key: K) {
    if (this.map.has(key)) {
      void Promise.resolve(this.get(key)).catch(() => {});
    }
  }

  evict(key: K) {
    this.map.delete(key);
  }
}
