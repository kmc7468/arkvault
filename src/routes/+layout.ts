import { redirect } from "@sveltejs/kit";
import { keyring } from "#lib/client/keys/index.js";
import type { LayoutLoad } from "./$types";

export const ssr = false;

const KEYLESS_PATHS = ["/auth/login", "/key", "/client/pending"];

export const load: LayoutLoad = ({ url }) => {
  if (KEYLESS_PATHS.some((path) => url.pathname.startsWith(path))) return;

  const redirectQuery = `?redirect=${encodeURIComponent(url.pathname + url.search)}`;
  if (!keyring.clientKeys) {
    redirect(307, "/key/generate" + redirectQuery);
  } else if (!keyring.hasMasterKeys) {
    redirect(307, "/client/pending" + redirectQuery);
  }
};
