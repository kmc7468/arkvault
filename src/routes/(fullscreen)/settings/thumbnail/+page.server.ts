import { createCaller } from "$trpc/router.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  const files = await createCaller(event).file.listWithoutThumbnail();
  return { files };
};
