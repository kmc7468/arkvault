import { error } from "@sveltejs/kit";
import { useTRPC } from "$trpc/client";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ fetch }) => {
  const trpc = useTRPC(fetch);

  try {
    const files = await trpc.file.listWithoutThumbnail.query();
    return { files };
  } catch {
    error(500, "Internal server error");
  }
};
