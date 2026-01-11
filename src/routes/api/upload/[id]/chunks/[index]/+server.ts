import { error, text } from "@sveltejs/kit";
import { Readable } from "stream";
import { z } from "zod";
import { authorize } from "$lib/server/modules/auth";
import { uploadChunk } from "$lib/server/services/upload";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ locals, params, request }) => {
  const { userId } = await authorize(locals, "activeClient");

  const zodRes = z
    .object({
      id: z.uuidv4(),
      index: z.coerce.number().int().nonnegative(),
    })
    .safeParse(params);
  if (!zodRes.success) error(400, "Invalid path parameters");
  const { id: uploadId, index: chunkIndex } = zodRes.data;

  // Parse Content-Digest header (RFC 9530)
  // Expected format: sha-256=:base64hash:
  const contentDigest = request.headers.get("Content-Digest");
  if (!contentDigest) error(400, "Missing Content-Digest header");

  const digestMatch = contentDigest.match(/^sha-256=:([A-Za-z0-9+/=]+):$/);
  if (!digestMatch || !digestMatch[1])
    error(400, "Invalid Content-Digest format, must be sha-256=:base64:");
  const encChunkHash = digestMatch[1];

  const contentType = request.headers.get("Content-Type");
  if (contentType !== "application/octet-stream" || !request.body) {
    error(400, "Invalid request body");
  }

  // Convert web ReadableStream to Node Readable
  const nodeReadable = Readable.fromWeb(
    request.body as unknown as Parameters<typeof Readable.fromWeb>[0],
  );

  await uploadChunk(userId, uploadId, chunkIndex, nodeReadable, encChunkHash);

  return text("Chunk uploaded", { headers: { "Content-Type": "text/plain" } });
};
