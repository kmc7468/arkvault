import { createCaller } from "$trpc/router.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  const favorites = await createCaller(event).favorites.get();
  return { favorites };
};
