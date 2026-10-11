import { ClientRepo, SessionRepo, IntegrityError } from "#lib/server/db/index.js";
import env from "#lib/server/config.js";
import { verifySessionId } from "#lib/server/crypto.js";
import { AppError } from "#lib/server/errors.js";

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

const ensureUserClientState = async (
  userId: number,
  clientId: number | undefined,
  state: "pending" | "active",
) => {
  if (!clientId) {
    throw new AppError("FORBIDDEN", "Forbidden");
  }

  const userClient = await ClientRepo.getUserClient(userId, clientId);
  if (!userClient) {
    throw new AppError("INTERNAL_SERVER_ERROR", "Invalid session id");
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
