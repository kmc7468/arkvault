import { trpc } from "$trpc/client";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ parent }) => {
  await parent(); // Wait for the key guard in the root layout
  const { nickname } = await trpc.user.get.query();
  return { nickname };
};
