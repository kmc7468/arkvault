import { getRedirectPath } from "#lib/shared/redirect.ts";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ url }) => {
  return { redirectPath: getRedirectPath(url) };
};
