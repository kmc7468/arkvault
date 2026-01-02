import { unwrapDataKey, decryptString } from "$lib/modules/crypto";

export class FilesystemCache<K, V extends RV, RV = V> {
  private map = new Map<K, V | Promise<V>>();

  get(key: K, loader: (isInitial: boolean, resolve: (value: RV | undefined) => void) => void) {
    const info = this.map.get(key);
    if (info instanceof Promise) {
      return info;
    }

    const { promise, resolve } = Promise.withResolvers<V>();
    if (!info) {
      this.map.set(key, promise);
    }

    loader(!info, (loadedInfo) => {
      if (!loadedInfo) return;

      const info = this.map.get(key)!;
      if (info instanceof Promise) {
        const state = $state(loadedInfo);
        this.map.set(key, state as V);
        resolve(state as V);
      } else {
        Object.assign(info, loadedInfo);
        resolve(info);
      }
    });

    return info ?? promise;
  }

  async bulkGet(
    keys: Set<K>,
    loader: (keys: Map<K, boolean>, resolve: (values: Map<K, RV>) => void) => void,
  ) {
    const states = new Map<K, V>();
    const promises = new Map<K, Promise<V>>();
    const resolvers = new Map<K, (value: V) => void>();

    keys.forEach((key) => {
      const info = this.map.get(key);
      if (info instanceof Promise) {
        promises.set(key, info);
      } else if (info) {
        states.set(key, info);
      } else {
        const { promise, resolve } = Promise.withResolvers<V>();
        this.map.set(key, promise);
        promises.set(key, promise);
        resolvers.set(key, resolve);
      }
    });

    loader(
      new Map([
        ...states.keys().map((key) => [key, false] as const),
        ...resolvers.keys().map((key) => [key, true] as const),
      ]),
      (loadedInfos) =>
        loadedInfos.forEach((loadedInfo, key) => {
          const info = this.map.get(key)!;
          const resolve = resolvers.get(key);
          if (info instanceof Promise) {
            const state = $state(loadedInfo);
            this.map.set(key, state as V);
            resolve?.(state as V);
          } else {
            Object.assign(info, loadedInfo);
            resolve?.(info);
          }
        }),
    );

    const newStates = await Promise.all(
      promises.entries().map(async ([key, promise]) => [key, await promise] as const),
    );
    return new Map([...states, ...newStates]);
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
