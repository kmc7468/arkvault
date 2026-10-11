import { redirect } from "@sveltejs/kit";
import { get } from "svelte/store";
import { clientKeyStore, masterKeyStore } from "#lib/stores/index.js";
import type { LayoutLoad } from "./$types";

export const ssr = false;

const KEYLESS_PATHS = ["/auth/login", "/key", "/client/pending"];

export const load: LayoutLoad = ({ url }) => {
  if (KEYLESS_PATHS.some((path) => url.pathname.startsWith(path))) return;

  const redirectQuery = `?redirect=${encodeURIComponent(url.pathname + url.search)}`;
  if (!get(clientKeyStore)) {
    redirect(307, "/key/generate" + redirectQuery);
  } else if (!get(masterKeyStore)) {
    redirect(307, "/client/pending" + redirectQuery);
  }
};
