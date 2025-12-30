export const monotonicResolve = <T>(
  promises: (Promise<T | undefined> | false)[],
  callback: (value: T) => void,
) => {
  let latestResolvedIndex = -1;

  promises.forEach((promise, index) => {
    if (!promise) return;
    promise.then((value) => {
      if (value !== undefined && index > latestResolvedIndex) {
        latestResolvedIndex = index;
        callback(value);
      }
    });
  });
};
