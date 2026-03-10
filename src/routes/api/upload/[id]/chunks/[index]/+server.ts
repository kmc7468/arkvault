import { error, text } from "@sveltejs/kit";
import { Readable } from "stream";
import type { ReadableStream } from "stream/web";
import { z } from "zod";
import { authorize } from "$lib/server/modules/auth";
import { uploadChunk } from "$lib/server/services/upload";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ locals, params, request }) => {
  const { userId } = await authorize(locals, "activeClient");

  const zodRes = z
    .object({
      id: z.uuidv4(),
      index: z.coerce.number().int().positive(),
    })
    .safeParse(params);
  if (!zodRes.success) error(400, "Invalid path parameters");
  const { id: sessionId, index: chunkIndex } = zodRes.data;

  if (!request.body) {
    error(400, "Invalid request body");
  }

  await uploadChunk(
    userId,
    sessionId,
    chunkIndex,
    Readable.fromWeb(request.body as ReadableStream),
  );
  return text("Chunk uploaded", { headers: { "Content-Type": "text/plain" } });
};
