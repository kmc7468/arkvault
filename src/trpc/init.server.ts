import type { RequestEvent } from "@sveltejs/kit";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { authorize, type ClientSession, type Session } from "#lib/server/auth.ts";
import { AppError, type ErrorCode } from "#lib/server/errors.ts";

export const createContext = (event: RequestEvent) => event;
export type Context = Awaited<ReturnType<typeof createContext>>;

export const t = initTRPC.context<Context>().create({ transformer: superjson });
export const router = t.router;

const trpcErrorCodes = {
  BAD_REQUEST: "BAD_REQUEST",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  RANGE_NOT_SATISFIABLE: "BAD_REQUEST",
  INTERNAL_SERVER_ERROR: "INTERNAL_SERVER_ERROR",
} as const satisfies Record<ErrorCode, TRPCError["code"]>;

// Converts `AppError`s thrown by services into tRPC errors
export const publicProcedure = t.procedure.use(async ({ next }) => {
  const result = await next();
  if (!result.ok && result.error.cause instanceof AppError) {
    const { code, message } = result.error.cause;
    throw new TRPCError({ code: trpcErrorCodes[code], message, cause: result.error.cause });
  }
  return result;
});

const authedProcedure = publicProcedure.use(async ({ ctx, next }) => {
  if (!ctx.locals.session) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next();
});

const sessionProcedure = (requiredPermission: "any" | "notClient") =>
  authedProcedure.use(async ({ ctx, next }) => {
    const session: Session = await authorize(ctx.locals, requiredPermission);
    return next({ ctx: { session } });
  });

const clientSessionProcedure = (
  requiredPermission: "anyClient" | "pendingClient" | "activeClient",
) =>
  authedProcedure.use(async ({ ctx, next }) => {
    const session: ClientSession = await authorize(ctx.locals, requiredPermission);
    return next({ ctx: { session } });
  });

export const roleProcedure = {
  any: sessionProcedure("any"),
  notClient: sessionProcedure("notClient"),
  anyClient: clientSessionProcedure("anyClient"),
  pendingClient: clientSessionProcedure("pendingClient"),
  activeClient: clientSessionProcedure("activeClient"),
};
