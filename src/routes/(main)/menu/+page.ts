import { trpc } from "$trpc/client";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ fetch }) => {
  const { nickname } = await trpc(fetch).user.get.query();
  return { nickname };
};
