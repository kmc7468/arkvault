import { error } from "@sveltejs/kit";
import { ClientRepo, SessionRepo, IntegrityError } from "$lib/server/db";
import env from "$lib/server/loadenv";
import { verifySessionId } from "$lib/server/modules/crypto";

export interface Session {
  sessionId: string;
  userId: number;
  clientId?: number;
}

export interface ClientSession extends Session {
  clientId: number;
}

export type SessionPermission =
  | "any"
  | "notClient"
  | "anyClient"
  | "pendingClient"
  | "activeClient";

export class AuthenticationError extends Error {
  constructor(
    public status: 400 | 401,
    message: string,
  ) {
    super(message);
    this.name = "AuthenticationError";
  }
}

export class AuthorizationError extends Error {
  constructor(
    public status: 403 | 500,
    message: string,
  ) {
    super(message);
    this.name = "AuthorizationError";
  }
}

export const cookieOptions = {
  path: "/",
  maxAge: env.session.exp / 1000,
  secure: true,
  sameSite: "strict",
} as const;

export const authenticate = async (sessionIdSigned: string, ip: string, userAgent: string) => {
  const sessionId = verifySessionId(sessionIdSigned, env.session.secret);
  if (!sessionId) {
    throw new AuthenticationError(400, "Invalid session id");
  }

  try {
    const { userId, clientId } = await SessionRepo.refreshSession(sessionId, ip, userAgent);
    return {
      id: sessionId,
      userId,
      clientId: clientId ?? undefined,
    };
  } catch (e) {
    if (e instanceof IntegrityError && e.message === "Session not found") {
      throw new AuthenticationError(401, "Invalid session id");
    }
    throw e;
  }
};

export const authorizeInternal = async (
  locals: App.Locals,
  requiredPermission: SessionPermission,
): Promise<Session> => {
  if (!locals.session) {
    throw new AuthorizationError(500, "Unauthenticated");
  }

  const { id: sessionId, userId, clientId } = locals.session;

  switch (requiredPermission) {
    case "any":
      break;
    case "notClient":
      if (clientId) {
        throw new AuthorizationError(403, "Forbidden");
      }
      break;
    case "anyClient":
      if (!clientId) {
        throw new AuthorizationError(403, "Forbidden");
      }
      break;
    case "pendingClient": {
      if (!clientId) {
        throw new AuthorizationError(403, "Forbidden");
      }
      const userClient = await ClientRepo.getUserClient(userId, clientId);
      if (!userClient) {
        throw new AuthorizationError(500, "Invalid session id");
      } else if (userClient.state !== "pending") {
        throw new AuthorizationError(403, "Forbidden");
      }
      break;
    }
    case "activeClient": {
      if (!clientId) {
        throw new AuthorizationError(403, "Forbidden");
      }
      const userClient = await ClientRepo.getUserClient(userId, clientId);
      if (!userClient) {
        throw new AuthorizationError(500, "Invalid session id");
      } else if (userClient.state !== "active") {
        throw new AuthorizationError(403, "Forbidden");
      }
      break;
    }
  }

  return { sessionId, userId, clientId };
};

export async function authorize(
  locals: App.Locals,
  requiredPermission: "any" | "notClient",
): Promise<Session>;

export async function authorize(
  locals: App.Locals,
  requiredPermission: "anyClient" | "pendingClient" | "activeClient",
): Promise<ClientSession>;

export async function authorize(
  locals: App.Locals,
  requiredPermission: SessionPermission,
): Promise<Session> {
  try {
    return await authorizeInternal(locals, requiredPermission);
  } catch (e) {
    if (e instanceof AuthorizationError) {
      error(e.status, e.message);
    }
    throw e;
  }
}
