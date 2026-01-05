import { untrack } from "svelte";
import { unwrapDataKey, decryptString } from "$lib/modules/crypto";

interface FilesystemCacheOptions<K, V> {
  fetchFromIndexedDB: (key: K) => Promise<V | undefined>;
  fetchFromServer: (key: K, cachedValue: V | undefined, masterKey: CryptoKey) => Promise<V>;
  bulkFetchFromIndexedDB?: (keys: Set<K>) => Promise<Map<K, V>>;
  bulkFetchFromServer?: (
    keys: Map<K, { cachedValue: V | undefined }>,
    masterKey: CryptoKey,
  ) => Promise<Map<K, V>>;
}

export class FilesystemCache<K, V extends object> {
  private map = new Map<K, { value?: V; promise?: Promise<V> }>();

  constructor(private readonly options: FilesystemCacheOptions<K, V>) {}

  get(key: K, masterKey: CryptoKey) {
    return untrack(() => {
      let state = this.map.get(key);
      if (state?.promise) return state.value ?? state.promise;

      const { promise: newPromise, resolve } = Promise.withResolvers<V>();

      if (!state) {
        const newState = $state({});
        state = newState;
        this.map.set(key, newState);
      }

      (state.value
        ? Promise.resolve(state.value)
        : this.options.fetchFromIndexedDB(key).then((loadedInfo) => {
            if (loadedInfo) {
              state.value = loadedInfo;
              resolve(state.value);
            }
            return loadedInfo;
          })
      )
        .then((cachedInfo) => this.options.fetchFromServer(key, cachedInfo, masterKey))
        .then((loadedInfo) => {
          if (state.value) {
            Object.assign(state.value, loadedInfo);
          } else {
            state.value = loadedInfo;
          }
          resolve(state.value);
        })
        .finally(() => {
          state.promise = undefined;
        });

      state.promise = newPromise;
      return state.value ?? newPromise;
    });
  }

  bulkGet(keys: Set<K>, masterKey: CryptoKey) {
    return untrack(() => {
      const newPromises = new Map(
        keys
          .keys()
          .filter((key) => this.map.get(key)?.promise === undefined)
          .map((key) => [key, Promise.withResolvers<V>()]),
      );
      newPromises.forEach(({ promise }, key) => {
        const state = this.map.get(key);
        if (state) {
          state.promise = promise;
        } else {
          const newState = $state({ promise });
          this.map.set(key, newState);
        }
      });

      const resolve = (loadedInfos: Map<K, V>) => {
        loadedInfos.forEach((loadedInfo, key) => {
          const state = this.map.get(key)!;
          if (state.value) {
            Object.assign(state.value, loadedInfo);
          } else {
            state.value = loadedInfo;
          }
          newPromises.get(key)!.resolve(state.value);
        });
        return loadedInfos;
      };

      this.options.bulkFetchFromIndexedDB!(
        new Set(newPromises.keys().filter((key) => this.map.get(key)!.value === undefined)),
      )
        .then(resolve)
        .then(() =>
          this.options.bulkFetchFromServer!(
            new Map(
              newPromises.keys().map((key) => [key, { cachedValue: this.map.get(key)!.value }]),
            ),
            masterKey,
          ),
        )
        .then(resolve)
        .finally(() => {
          newPromises.forEach((_, key) => {
            this.map.get(key)!.promise = undefined;
          });
        });

      const bottleneckPromises = Array.from(
        keys
          .keys()
          .filter((key) => this.map.get(key)!.value === undefined)
          .map((key) => this.map.get(key)!.promise!),
      );
      const makeResult = () =>
        new Map(keys.keys().map((key) => [key, this.map.get(key)!.value!] as const));
      return bottleneckPromises.length > 0
        ? Promise.all(bottleneckPromises).then(makeResult)
        : makeResult();
    });
  }
}

export const decryptDirectoryMetadata = async (
  metadata: { dek: string; dekVersion: Date; name: string; nameIv: string },
  masterKey: CryptoKey,
) => {
  const { dataKey } = await unwrapDataKey(metadata.dek, masterKey);
  const name = await decryptString(metadata.name, metadata.nameIv, dataKey);

  return {
    dataKey: { key: dataKey, version: metadata.dekVersion },
    name,
  };
};

const decryptDate = async (ciphertext: string, iv: string, dataKey: CryptoKey) => {
  return new Date(parseInt(await decryptString(ciphertext, iv, dataKey), 10));
};

export const decryptFileMetadata = async (
  metadata: {
    dek: string;
    dekVersion: Date;
    name: string;
    nameIv: string;
    createdAt?: string;
    createdAtIv?: string;
    lastModifiedAt: string;
    lastModifiedAtIv: string;
  },
  masterKey: CryptoKey,
) => {
  const { dataKey } = await unwrapDataKey(metadata.dek, masterKey);
  const [name, createdAt, lastModifiedAt] = await Promise.all([
    decryptString(metadata.name, metadata.nameIv, dataKey),
    metadata.createdAt
      ? decryptDate(metadata.createdAt, metadata.createdAtIv!, dataKey)
      : undefined,
    decryptDate(metadata.lastModifiedAt, metadata.lastModifiedAtIv, dataKey),
  ]);

  return {
    dataKey: { key: dataKey, version: metadata.dekVersion },
    name,
    createdAt,
    lastModifiedAt,
  };
};

export const decryptCategoryMetadata = decryptDirectoryMetadata;
