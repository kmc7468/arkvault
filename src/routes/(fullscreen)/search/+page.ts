import { error } from "@sveltejs/kit";
import { z } from "zod";
import type { PageLoad } from "./$types";

export const load: PageLoad = ({ url }) => {
  const directoryId = url.searchParams.get("directoryId");
  const from = url.searchParams.get("from");

  const zodRes = z
    .object({
      directoryId: z.coerce.number().int().positive().nullable(),
      from: z.enum(["favorites"]).nullable(),
    })
    .safeParse({ directoryId, from });
  if (!zodRes.success) error(400, "Invalid query parameters");

  return {
    directoryId: zodRes.data.directoryId,
    fromFavorites: zodRes.data.from === "favorites",
  };
};
