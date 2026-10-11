import { trpc } from "#trpc/client.ts";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ parent }) => {
  await parent(); // Wait for the key guard in the root layout
  const files = await trpc.file.listWithoutThumbnail.query();
  return { files };
};
