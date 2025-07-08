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

interface ClientSession extends Session {
  clientId: number;
}

export class AuthenticationError extends Error {
  constructor(
    public status: 400 | 401,
    message: string,
  ) {
    super(message);
    this.name = "AuthenticationError";
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

export async function authorize(locals: App.Locals, requiredPermission: "any"): Promise<Session>;

export async function authorize(
  locals: App.Locals,
  requiredPermission: "notClient",
): Promise<Session>;

export async function authorize(
  locals: App.Locals,
  requiredPermission: "anyClient",
): Promise<ClientSession>;

export async function authorize(
  locals: App.Locals,
  requiredPermission: "pendingClient",
): Promise<ClientSession>;

export async function authorize(
  locals: App.Locals,
  requiredPermission: "activeClient",
): Promise<ClientSession>;

export async function authorize(
  locals: App.Locals,
  requiredPermission: "any" | "notClient" | "anyClient" | "pendingClient" | "activeClient",
): Promise<Session> {
  if (!locals.session) {
    error(500, "Unauthenticated");
  }

  const { id: sessionId, userId, clientId } = locals.session;

  switch (requiredPermission) {
    case "any":
      break;
    case "notClient":
      if (clientId) {
        error(403, "Forbidden");
      }
      break;
    case "anyClient":
      if (!clientId) {
        error(403, "Forbidden");
      }
      break;
    case "pendingClient": {
      if (!clientId) {
        error(403, "Forbidden");
      }
      const userClient = await getUserClient(userId, clientId);
      if (!userClient) {
        error(500, "Invalid session id");
      } else if (userClient.state !== "pending") {
        error(403, "Forbidden");
      }
      break;
    }
    case "activeClient": {
      if (!clientId) {
        error(403, "Forbidden");
      }
      const userClient = await getUserClient(userId, clientId);
      if (!userClient) {
        error(500, "Invalid session id");
      } else if (userClient.state !== "active") {
        error(403, "Forbidden");
      }
      break;
    }
  }

  return { sessionId, userId, clientId };
}
