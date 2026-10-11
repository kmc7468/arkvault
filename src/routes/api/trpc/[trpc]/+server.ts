import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { createContext } from "#trpc/init.server.ts";
import { appRouter } from "#trpc/router.server.ts";
import type { RequestHandler } from "./$types";

const trpcHandler: RequestHandler = (event) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    allowMethodOverride: true,
    req: event.request,
    router: appRouter,
    createContext: () => createContext(event),
  });

export const GET = trpcHandler;
export const POST = trpcHandler;
