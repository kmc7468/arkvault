import { error } from "@sveltejs/kit";
import { z } from "zod";
import type { PageLoad } from "./$types";

export const load: PageLoad = ({ url }) => {
  const directoryId = url.searchParams.get("directoryId");

  const zodRes = z
    .object({
      directoryId: z.coerce.number().int().positive().nullable(),
    })
    .safeParse({ directoryId });
  if (!zodRes.success) error(400, "Invalid query parameters");

  return {
    directoryId: zodRes.data.directoryId,
  };
};
