import { error } from "@sveltejs/kit";
import { keyExportState } from "#lib/utils/index.js";
import type { PageLoad } from "./$types";

export const load: PageLoad = async () => {
  const state = keyExportState.get();
  if (!state) {
    error(403, "Forbidden");
  }
  return state;
};
