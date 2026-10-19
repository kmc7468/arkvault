import { error, redirect } from "@sveltejs/kit";
import type { Handle } from "@sveltejs/kit/hooks";
import { cookieOptions, authenticate, AuthenticationError } from "#lib/server/auth.ts";
import { getRedirectPath, withRedirectPath } from "#lib/shared/redirect.ts";

export const authenticateMiddleware: Handle = async ({ event, resolve }) => {
  try {
    const sessionIdSigned = event.cookies.get("sessionId");
    if (!sessionIdSigned) {
      throw new AuthenticationError(401, "Session id not found");
    }

    const { ip, userAgent } = event.locals;
    event.locals.session = await authenticate(sessionIdSigned, ip, userAgent);
    event.cookies.set("sessionId", sessionIdSigned, cookieOptions);
  } catch (e) {
    if (e instanceof AuthenticationError) {
      const { pathname, search } = event.url;
      if (pathname === "/auth/login" || pathname.startsWith("/api/trpc")) {
        return await resolve(event);
      } else if (pathname.startsWith("/api")) {
        error(e.status, e.message);
      } else {
        redirect(302, withRedirectPath("/auth/login", pathname + search));
      }
    }
    throw e;
  }

  if (event.url.pathname === "/auth/login") {
    redirect(302, getRedirectPath(event.url));
  }

  return await resolve(event);
};

export default authenticateMiddleware;
