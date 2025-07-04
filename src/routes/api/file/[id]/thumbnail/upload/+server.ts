import Busboy from "@fastify/busboy";
import { error, text } from "@sveltejs/kit";
import { Readable, Writable } from "stream";
import { z } from "zod";
import { authorize } from "$lib/server/modules/auth";
import { fileThumbnailUploadRequest, type FileThumbnailUploadRequest } from "$lib/server/schemas";
import { uploadFileThumbnail } from "$lib/server/services/file";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ locals, params, request }) => {
  const { userId } = await authorize(locals, "activeClient");

  const zodRes = z
    .object({
      id: z.coerce.number().int().positive(),
    })
    .safeParse(params);
  if (!zodRes.success) error(400, "Invalid path parameters");
  const { id } = zodRes.data;

  const contentType = request.headers.get("Content-Type");
  if (!contentType?.startsWith("multipart/form-data") || !request.body) {
    error(400, "Invalid request body");
  }

  return new Promise<Response>((resolve, reject) => {
    const bb = Busboy({ headers: { "content-type": contentType } });
    const handler =
      <T extends unknown[]>(f: (...args: T) => Promise<void>) =>
      (...args: T) => {
        f(...args).catch(reject);
      };

    let metadata: FileThumbnailUploadRequest | null = null;
    let content: Readable | null = null;
    bb.on(
      "field",
      handler(async (fieldname, val) => {
        if (fieldname === "metadata") {
          // Ignore subsequent metadata fields
          if (!metadata) {
            metadata = fileThumbnailUploadRequest.parse(val);
          }
        } else {
          error(400, "Invalid request body");
        }
      }),
    );
    bb.on(
      "file",
      handler(async (fieldname, file) => {
        if (fieldname !== "content") error(400, "Invalid request body");
        if (!metadata || content) error(400, "Invalid request body");
        content = file;

        await uploadFileThumbnail(
          userId,
          id,
          new Date(metadata.dekVersion),
          metadata.encContentIv,
          content,
        );
        resolve(text("Thumbnail uploaded", { headers: { "Content-Type": "text/plain" } }));
      }),
    );
    bb.on("error", (e) => {
      content?.emit("error", e) ?? reject(e);
    });

    request.body!.pipeTo(Writable.toWeb(bb)).catch(() => {}); // busboy will handle the error
  });
};
