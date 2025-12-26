import { error } from "@sveltejs/kit";
import { trpc } from "$trpc/client";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ fetch }) => {
  try {
    const files = await trpc(fetch).file.listWithoutThumbnail.query();
    return { files };
  } catch {
    // TODO: Error Handling
    error(500, "Internal server error");
  }
};
