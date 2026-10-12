import { ClientRepo, SessionRepo, db } from "#lib/server/db/index.ts";
import env from "#lib/server/config.ts";
import { verifySessionId } from "#lib/server/crypto.ts";
import { AppError, invalidSessionError } from "#lib/server/errors.ts";

export interface Session {
  sessionId: string;
  userId: number;
  clientId?: number;
}

export interface ClientSession extends Session {
  clientId: number;
}

export type SessionPermission =
  "any" | "notClient" | "anyClient" | "pendingClient" | "activeClient";

export class AuthenticationError extends Error {
  constructor(
    public status: 400 | 401,
    message: string,
  ) {
    super(message);
    this.name = "AuthenticationError";
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

  const session = await SessionRepo.refreshSession(db, sessionId, ip, userAgent);
  if (!session) {
    throw new AuthenticationError(401, "Invalid session id");
  }
  return {
    id: sessionId,
    userId: session.userId,
    clientId: session.clientId ?? undefined,
  };
};

const ensureUserClientState = async (
  userId: number,
  clientId: number | undefined,
  state: "pending" | "active",
) => {
  if (!clientId) {
    throw new AppError("FORBIDDEN", "Forbidden");
  }

  const userClient = await ClientRepo.getUserClient(db, userId, clientId);
  if (!userClient) {
    throw invalidSessionError();
  } else if (userClient.state !== state) {
    throw new AppError("FORBIDDEN", "Forbidden");
  }
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
  if (!locals.session) {
    throw new AppError("UNAUTHORIZED", "Unauthenticated");
  }

  const { id: sessionId, userId, clientId } = locals.session;

  switch (requiredPermission) {
    case "any":
      break;
    case "notClient":
      if (clientId) {
        throw new AppError("FORBIDDEN", "Forbidden");
      }
      break;
    case "anyClient":
      if (!clientId) {
        throw new AppError("FORBIDDEN", "Forbidden");
      }
      break;
    case "pendingClient":
      await ensureUserClientState(userId, clientId, "pending");
      break;
    case "activeClient":
      await ensureUserClientState(userId, clientId, "active");
      break;
  }

  return { sessionId, userId, clientId };
}
