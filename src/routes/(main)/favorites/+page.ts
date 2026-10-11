import { trpc } from "$trpc/client";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ parent }) => {
  await parent(); // Wait for the key guard in the root layout
  const favorites = await trpc.favorites.get.query();
  return { favorites };
};
