import type { RequestEvent } from "@sveltejs/kit";
import { initTRPC, TRPCError } from "@trpc/server";
import { authorizeMiddleware, authorizeClientMiddleware } from "./middlewares/authorize";

export const createContext = (event: RequestEvent) => event;

export const t = initTRPC.context<Awaited<ReturnType<typeof createContext>>>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

const authedProcedure = publicProcedure.use(async ({ ctx, next }) => {
  if (!ctx.locals.session) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next();
});

export const roleProcedure = {
  any: authedProcedure.use(authorizeMiddleware("any")),
  notClient: authedProcedure.use(authorizeMiddleware("notClient")),
  anyClient: authedProcedure.use(authorizeClientMiddleware("anyClient")),
  pendingClient: authedProcedure.use(authorizeClientMiddleware("pendingClient")),
  activeClient: authedProcedure.use(authorizeClientMiddleware("activeClient")),
};
