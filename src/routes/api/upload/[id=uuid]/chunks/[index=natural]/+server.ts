import { error } from "@sveltejs/kit";
import { Readable } from "stream";
import type { ReadableStream } from "stream/web";
import { authorize } from "#lib/server/auth.ts";
import { handleAppErrors } from "#lib/server/http.ts";
import { UploadService } from "#lib/server/services/index.ts";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = handleAppErrors(async ({ locals, params, request }) => {
  const { userId } = await authorize(locals, "activeClient");

  const { id: sessionId, index: chunkIndex } = params;

  if (!request.body) {
    error(400, "Invalid request body");
  }

  await UploadService.uploadChunk(
    userId,
    sessionId,
    chunkIndex,
    Readable.fromWeb(request.body as ReadableStream),
  );
  return new Response("Chunk uploaded", { headers: { "Content-Type": "text/plain" } });
});
