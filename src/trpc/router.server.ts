import type { RequestEvent } from "@sveltejs/kit";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { createContext, router } from "./init.server";
import { clientRouter } from "./routers";

export const appRouter = router({
  client: clientRouter,
});

export const createCaller = (event: RequestEvent) => appRouter.createCaller(createContext(event));

export type AppRouter = typeof appRouter;
export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;
