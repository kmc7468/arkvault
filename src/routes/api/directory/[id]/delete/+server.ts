import { error, json } from "@sveltejs/kit";
import { z } from "zod";
import { authorize } from "$lib/server/modules/auth";
import { directoryDeleteResponse, type DirectoryDeleteResponse } from "$lib/server/schemas";
import { deleteDirectory } from "$lib/server/services/directory";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ locals, params }) => {
  const { userId } = await authorize(locals, "activeClient");

  const zodRes = z
    .object({
      id: z.coerce.number().int().positive(),
    })
    .safeParse(params);
  if (!zodRes.success) error(400, "Invalid path parameters");
  const { id } = zodRes.data;

  const { directories, files } = await deleteDirectory(userId, id);
  return json(
    directoryDeleteResponse.parse({
      deletedDirectories: directories,
      deletedFiles: files,
    } satisfies DirectoryDeleteResponse),
  );
};
