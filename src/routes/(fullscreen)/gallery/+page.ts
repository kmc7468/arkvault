import { trpc } from "$trpc/client";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ parent }) => {
  await parent(); // Wait for the key guard in the root layout
  const files = await trpc.file.list.query();
  return { files };
};
