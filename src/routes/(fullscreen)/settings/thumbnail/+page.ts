import { error } from "@sveltejs/kit";
import { callPostApi } from "$lib/hooks";
import type { MissingThumbnailFileScanResponse } from "$lib/server/schemas";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ fetch }) => {
  const res = await callPostApi("/api/file/scanMissingThumbnails", undefined, { fetch });
  if (!res.ok) {
    error(500, "Internal server error");
  }

  const { files }: MissingThumbnailFileScanResponse = await res.json();
  return { files };
};
