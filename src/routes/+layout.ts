import { redirect } from "@sveltejs/kit";
import { keyring } from "#lib/client/keys/index.ts";
import { withRedirectPath } from "#lib/shared/redirect.ts";
import type { LayoutLoad } from "./$types";

export const ssr = false;

const KEYLESS_PATHS = ["/auth/login", "/key", "/client/pending"];

export const load: LayoutLoad = ({ url }) => {
  if (KEYLESS_PATHS.some((path) => url.pathname.startsWith(path))) return;

  const redirectPath = url.pathname + url.search;
  if (!keyring.clientKeys) {
    redirect(307, withRedirectPath("/key/generate", redirectPath));
  } else if (!keyring.hasMasterKeys) {
    redirect(307, withRedirectPath("/client/pending", redirectPath));
  }
};
