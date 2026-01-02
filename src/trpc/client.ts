import { createTRPCClient, httpBatchLink, TRPCClientError } from "@trpc/client";
import superjson from "superjson";
import { browser } from "$app/environment";
import type { AppRouter } from "./router.server";

const createClient = (fetch: typeof globalThis.fetch) =>
  createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: "/api/trpc",
        maxURLLength: 4096,
        methodOverride: "POST",
        transformer: superjson,
        fetch,
      }),
    ],
  });

let browserClient: ReturnType<typeof createClient>;

export const trpc = (fetch = globalThis.fetch) => {
  const client = browserClient ?? createClient(fetch);
  if (browser) {
    browserClient ??= client;
  }
  return client;
};

export const isTRPCClientError = (e: unknown): e is TRPCClientError<AppRouter> => {
  return e instanceof TRPCClientError;
};
