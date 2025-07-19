interface FetchOptions {
  fetch?: typeof fetch;
  signal?: AbortSignal;
}

export const callGetApi = async (
  input: RequestInfo,
  { fetch = globalThis.fetch, signal }: FetchOptions = {},
) => {
  return await fetch(input, { method: "GET", signal });
};

export const callPostApi = async <T>(
  input: RequestInfo,
  payload?: T,
  { fetch = globalThis.fetch, signal }: FetchOptions = {},
) => {
  return await fetch(input, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload ? JSON.stringify(payload) : undefined,
    signal,
  });
};
