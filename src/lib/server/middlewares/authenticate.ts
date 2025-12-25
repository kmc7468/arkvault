import { error, redirect, type Handle } from "@sveltejs/kit";
import env from "$lib/server/loadenv";
import { authenticate, AuthenticationError } from "$lib/server/modules/auth";

export const authenticateMiddleware: Handle = async ({ event, resolve }) => {
  const { pathname, search } = event.url;
  if (pathname === "/api/auth/login" || pathname.startsWith("/trpc")) {
    return await resolve(event);
  }

  try {
    const sessionIdSigned = event.cookies.get("sessionId");
    if (!sessionIdSigned) {
      throw new AuthenticationError(401, "Session id not found");
    }

    const { ip, userAgent } = event.locals;
    event.locals.session = await authenticate(sessionIdSigned, ip, userAgent);
    event.cookies.set("sessionId", sessionIdSigned, {
      path: "/",
      maxAge: env.session.exp / 1000,
      secure: true,
      sameSite: "strict",
    });
  } catch (e) {
    if (e instanceof AuthenticationError) {
      if (pathname === "/auth/login") {
        return await resolve(event);
      } else if (pathname.startsWith("/api")) {
        error(e.status, e.message);
      } else {
        redirect(302, "/auth/login?redirect=" + encodeURIComponent(pathname + search));
      }
    }
    throw e;
  }

  return await resolve(event);
};

export default authenticateMiddleware;
