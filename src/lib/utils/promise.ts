export const monotonicResolve = <T>(
  promises: (Promise<T> | false)[],
  callback: (value: T) => void,
) => {
  let latestResolvedIndex = -1;
  promises
    .filter((promise) => !!promise)
    .forEach((promise, index) => {
      promise.then((value) => {
        if (index > latestResolvedIndex) {
          latestResolvedIndex = index;
          callback(value);
        }
      });
    });
};
