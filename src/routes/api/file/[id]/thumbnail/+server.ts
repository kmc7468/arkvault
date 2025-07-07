import { error, json } from "@sveltejs/kit";
import { z } from "zod";
import { authorize } from "$lib/server/modules/auth";
import { fileThumbnailInfoResponse, type FileThumbnailInfoResponse } from "$lib/server/schemas";
import { getFileThumbnailInformation } from "$lib/server/services/file";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals, params }) => {
  const { userId } = await authorize(locals, "activeClient");

  const zodRes = z
    .object({
      id: z.coerce.number().int().positive(),
    })
    .safeParse(params);
  if (!zodRes.success) error(400, "Invalid path parameters");
  const { id } = zodRes.data;

  const { updatedAt, encContentIv } = await getFileThumbnailInformation(userId, id);
  return json(
    fileThumbnailInfoResponse.parse({
      updatedAt: updatedAt.toISOString(),
      contentIv: encContentIv,
    } satisfies FileThumbnailInfoResponse),
  );
};
