import { error, text } from "@sveltejs/kit";
import { z } from "zod";
import { authorize } from "$lib/server/modules/auth";
import { fileRenameRequest } from "$lib/server/schemas";
import { renameFile } from "$lib/server/services/file";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request, cookies, params }) => {
  const { userId } = await authorize(cookies, "activeClient");

  const paramsZodRes = z
    .object({
      id: z.coerce.number().int().positive(),
    })
    .safeParse(params);
  if (!paramsZodRes.success) error(400, "Invalid path parameters");
  const { id } = paramsZodRes.data;

  const bodyZodRes = fileRenameRequest.safeParse(await request.json());
  if (!bodyZodRes.success) error(400, "Invalid request body");
  const { dekVersion, name, nameIv } = bodyZodRes.data;

  await renameFile(userId, id, dekVersion, name, nameIv);
  return text("File renamed", { headers: { "Content-Type": "text/plain" } });
};