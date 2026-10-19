import { error } from "@sveltejs/kit";
import type { Handle } from "@sveltejs/kit/hooks";

export const setAgentInfoMiddleware: Handle = async ({ event, resolve }) => {
  const ip = event.getClientAddress();
  const userAgent = event.request.headers.get("User-Agent");
  if (!ip) {
    error(500, "IP address not found");
  } else if (!userAgent && !event.isSubRequest) {
    error(400, "User agent not found");
  }

  event.locals.ip = ip;
  event.locals.userAgent = userAgent ?? "";

  return await resolve(event);
};

export default setAgentInfoMiddleware;
