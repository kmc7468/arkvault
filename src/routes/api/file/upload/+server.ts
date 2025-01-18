import Busboy from "@fastify/busboy";
import { error, text } from "@sveltejs/kit";
import { Readable, Writable } from "stream";
import { authorize } from "$lib/server/modules/auth";
import { fileUploadRequest } from "$lib/server/schemas";
import { uploadFile } from "$lib/server/services/file";
import type { RequestHandler } from "./$types";

type FileMetadata = Parameters<typeof uploadFile>[0];

const parseFileMetadata = (userId: number, json: string) => {
  const zodRes = fileUploadRequest.safeParse(JSON.parse(json));
  if (!zodRes.success) error(400, "Invalid request body");
  const {
    parent,
    mekVersion,
    dek,
    dekVersion,
    hskVersion,
    contentHmac,
    contentType,
    contentIv,
    name,
    nameIv,
    createdAt,
    createdAtIv,
    lastModifiedAt,
    lastModifiedAtIv,
  } = zodRes.data;
  if ((createdAt && !createdAtIv) || (!createdAt && createdAtIv))
    error(400, "Invalid request body");

  return {
    userId,
    parentId: parent,
    mekVersion,
    encDek: dek,
    dekVersion: new Date(dekVersion),
    hskVersion,
    contentHmac,
    contentType,
    encContentIv: contentIv,
    encName: name,
    encNameIv: nameIv,
    encCreatedAt: createdAt ?? null,
    encCreatedAtIv: createdAtIv ?? null,
    encLastModifiedAt: lastModifiedAt,
    encLastModifiedAtIv: lastModifiedAtIv,
  } satisfies FileMetadata;
};

export const POST: RequestHandler = async ({ locals, request }) => {
  const { userId } = await authorize(locals, "activeClient");

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

    let metadata: FileMetadata | null = null;
    let content: Readable | null = null;

    bb.on(
      "field",
      handler(async (fieldname, val) => {
        if (fieldname !== "metadata") error(400, "Invalid request body");
        if (metadata || content) error(400, "Invalid request body");
        metadata = parseFileMetadata(userId, val);
      }),
    );
    bb.on(
      "file",
      handler(async (fieldname, file) => {
        if (fieldname !== "content") error(400, "Invalid request body");
        if (!metadata || content) error(400, "Invalid request body");
        content = file;

        await uploadFile(metadata, content);
        resolve(text("File uploaded", { headers: { "Content-Type": "text/plain" } }));
      }),
    );
    bb.on("error", (e) => content?.emit("error", e) ?? reject(e));

    request.body!.pipeTo(Writable.toWeb(bb)).catch(() => {}); // busboy will handle the error
  });
};
