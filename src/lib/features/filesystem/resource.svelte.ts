import { untrack } from "svelte";

// Exposes the value of a cache entry identified by a reactive key. Cached values are available
// synchronously, so that views don't flicker while revalidating.
export const useResource = <K, V>(getKey: () => K, load: (key: K) => V | Promise<V>) => {
  let current: V | undefined = $state();

  $effect.pre(() => {
    const key = getKey();
    let isStale = false;

    const result = untrack(() => load(key));
    if (result instanceof Promise) {
      result
        .then((value) => {
          if (!isStale) current = value;
        })
        .catch(() => {}); // Logged by the cache
    } else {
      current = result;
    }

    return () => {
      isStale = true;
    };
  });

  return {
    get current() {
      return current;
    },
  };
};
