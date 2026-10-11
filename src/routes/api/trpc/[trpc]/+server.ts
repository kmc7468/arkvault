import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { createContext } from "#trpc/init.server.js";
import { appRouter } from "#trpc/router.server.js";
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
