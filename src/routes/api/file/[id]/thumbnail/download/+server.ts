import { error } from "@sveltejs/kit";
import { z } from "zod";
import { authorize } from "$lib/server/modules/auth";
import { getFileThumbnailStream } from "$lib/server/services/file";
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

  const { encContentStream, encContentSize } = await getFileThumbnailStream(userId, id);
  return new Response(encContentStream as ReadableStream, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": encContentSize.toString(),
    },
  });
};
