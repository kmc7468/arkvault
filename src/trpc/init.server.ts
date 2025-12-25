import type { RequestEvent } from "@sveltejs/kit";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { authorizeMiddleware, authorizeClientMiddleware } from "./middlewares/authorize";

export type Context = Awaited<ReturnType<typeof createContext>>;

export const createContext = (event: RequestEvent) => event;
export const t = initTRPC.context<Context>().create({ transformer: superjson });

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
