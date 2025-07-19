import { error } from "@sveltejs/kit";
import { callGetApi } from "$lib/hooks";
import type { UserInfoResponse } from "$lib/server/schemas";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ fetch }) => {
  const res = await callGetApi("/api/user", { fetch });
  if (!res.ok) {
    error(500, "Internal server error");
  }

  const { nickname }: UserInfoResponse = await res.json();
  return { nickname };
};
