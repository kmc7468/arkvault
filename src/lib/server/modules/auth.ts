import { error } from "@sveltejs/kit";
import { getUserClient } from "$lib/server/db/client";
import { IntegrityError } from "$lib/server/db/error";
import { createSession, refreshSession } from "$lib/server/db/session";
import env from "$lib/server/loadenv";
import { issueSessionId, verifySessionId } from "$lib/server/modules/crypto";

interface Session {
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

export const startSession = async (userId: number, ip: string, userAgent: string) => {
  const { sessionId, sessionIdSigned } = await issueSessionId(32, env.session.secret);
  await createSession(userId, sessionId, ip, userAgent);
  return sessionIdSigned;
};

export const authenticate = async (sessionIdSigned: string, ip: string, userAgent: string) => {
  const sessionId = verifySessionId(sessionIdSigned, env.session.secret);
  if (!sessionId) {
    throw new AuthenticationError(400, "Invalid session id");
  }

  try {
    const { userId, clientId } = await refreshSession(sessionId, ip, userAgent);
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
      const userClient = await getUserClient(userId, clientId);
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
      const userClient = await getUserClient(userId, clientId);
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
