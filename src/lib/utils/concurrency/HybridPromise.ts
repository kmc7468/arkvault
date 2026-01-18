type MaybePromise<T> = T | Promise<T> | HybridPromise<T>;

type HybridPromiseState<T> =
  | { mode: "sync"; status: "fulfilled"; value: T }
  | { mode: "sync"; status: "rejected"; reason: unknown }
  | { mode: "async"; promise: Promise<T> };

export class HybridPromise<T> implements PromiseLike<T> {
  private isConsumed = false;

  private constructor(private readonly state: HybridPromiseState<T>) {
    if (state.mode === "sync" && state.status === "rejected") {
      queueMicrotask(() => {
        if (!this.isConsumed) {
          throw state.reason;
        }
      });
    }
  }

  isSync(): boolean {
    return this.state.mode === "sync";
  }

  toPromise(): Promise<T> {
    this.isConsumed = true;

    if (this.state.mode === "async") return this.state.promise;
    return this.state.status === "fulfilled"
      ? Promise.resolve(this.state.value)
      : Promise.reject(this.state.reason);
  }

  static resolve<T>(value: MaybePromise<T>): HybridPromise<T> {
    if (value instanceof HybridPromise) return value;
    return new HybridPromise(
      value instanceof Promise
        ? { mode: "async", promise: value }
        : { mode: "sync", status: "fulfilled", value },
    );
  }

  static reject<T = never>(reason?: unknown): HybridPromise<T> {
    return new HybridPromise({ mode: "sync", status: "rejected", reason });
  }

  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => MaybePromise<TResult1>) | null | undefined,
    onrejected?: ((reason: unknown) => MaybePromise<TResult2>) | null | undefined,
  ): HybridPromise<TResult1 | TResult2> {
    this.isConsumed = true;

    if (this.state.mode === "async") {
      return new HybridPromise({
        mode: "async",
        promise: this.state.promise.then(onfulfilled, onrejected) as any,
      });
    }

    try {
      if (this.state.status === "fulfilled") {
        if (!onfulfilled) return HybridPromise.resolve(this.state.value as any);
        return HybridPromise.resolve(onfulfilled(this.state.value));
      } else {
        if (!onrejected) return HybridPromise.reject(this.state.reason);
        return HybridPromise.resolve(onrejected(this.state.reason));
      }
    } catch (e) {
      return HybridPromise.reject(e);
    }
  }

  catch<TResult = never>(
    onrejected?: ((reason: unknown) => MaybePromise<TResult>) | null | undefined,
  ): HybridPromise<T | TResult> {
    return this.then<T, TResult>(null, onrejected);
  }

  finally(onfinally?: (() => void) | null | undefined): HybridPromise<T> {
    this.isConsumed = true;

    if (this.state.mode === "async") {
      return new HybridPromise({ mode: "async", promise: this.state.promise.finally(onfinally) });
    }

    try {
      onfinally?.();
      return new HybridPromise(this.state);
    } catch (e) {
      return HybridPromise.reject(e);
    }
  }

  static all<T extends readonly unknown[] | []>(
    maybePromises: T,
  ): HybridPromise<{ -readonly [P in keyof T]: HybridAwaited<T[P]> }> {
    const length = maybePromises.length;
    if (length === 0) {
      return HybridPromise.resolve([] as any);
    }

    const hps = Array.from(maybePromises).map((p) => HybridPromise.resolve(p));
    if (hps.some((hp) => !hp.isSync())) {
      return new HybridPromise({
        mode: "async",
        promise: Promise.all(hps.map((hp) => hp.toPromise())) as any,
      });
    }

    try {
      return HybridPromise.resolve(
        Array.from(
          hps.map((hp) => {
            if (hp.state.mode === "sync") {
              if (hp.state.status === "fulfilled") {
                return hp.state.value;
              } else {
                throw hp.state.reason;
              }
            }
          }),
        ) as any,
      );
    } catch (e) {
      return HybridPromise.reject(e);
    }
  }
}

export type HybridAwaited<T> =
  T extends HybridPromise<infer U> ? U : T extends Promise<infer U> ? U : T;
