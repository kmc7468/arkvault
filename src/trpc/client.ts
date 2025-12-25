import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import { browser } from "$app/environment";
import type { AppRouter } from "./router.server";

const createClient = (fetch: typeof globalThis.fetch) =>
  createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: "/api/trpc",
        transformer: superjson,
        fetch,
      }),
    ],
  });

let browserClient: ReturnType<typeof createClient>;

export const useTRPC = (fetch = globalThis.fetch) => {
  const client = browserClient ?? createClient(fetch);
  if (browser) {
    browserClient ??= client;
  }
  return client;
};
