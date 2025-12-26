import { error } from "@sveltejs/kit";
import { trpc } from "$trpc/client";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ fetch }) => {
  try {
    const { nickname } = await trpc(fetch).user.get.query();
    return { nickname };
  } catch {
    // TODO: Error Handling
    error(500, "Internal server error");
  }
};
