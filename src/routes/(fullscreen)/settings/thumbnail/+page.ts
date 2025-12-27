import { trpc } from "$trpc/client";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ fetch }) => {
  const files = await trpc(fetch).file.listWithoutThumbnail.query();
  return { files };
};
