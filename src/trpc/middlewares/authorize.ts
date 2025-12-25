import { TRPCError } from "@trpc/server";
import {
  AuthorizationError,
  authorizeInternal,
  type ClientSession,
  type SessionPermission,
} from "$lib/server/modules/auth";
import { t } from "../init.server";

const authorize = async (locals: App.Locals, requiredPermission: SessionPermission) => {
  try {
    return await authorizeInternal(locals, requiredPermission);
  } catch (e) {
    if (e instanceof AuthorizationError) {
      throw new TRPCError({
        code: e.status === 403 ? "FORBIDDEN" : "INTERNAL_SERVER_ERROR",
        message: e.message,
      });
    }
    throw e;
  }
};

export const authorizeMiddleware = (requiredPermission: "any" | "notClient") =>
  t.middleware(async ({ ctx, next }) => {
    const session = await authorize(ctx.locals, requiredPermission);
    return next({ ctx: { session } });
  });

export const authorizeClientMiddleware = (
  requiredPermission: "anyClient" | "pendingClient" | "activeClient",
) =>
  t.middleware(async ({ ctx, next }) => {
    const session = (await authorize(ctx.locals, requiredPermission)) as ClientSession;
    return next({ ctx: { session } });
  });
