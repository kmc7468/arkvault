import { error, json } from "@sveltejs/kit";
import { z } from "zod";
import { authorize } from "$lib/server/modules/auth";
import { fileInfoResponse, type FileInfoResponse } from "$lib/server/schemas";
import { getFileInformation } from "$lib/server/services/file";
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

  const {
    parentId,
    mekVersion,
    encDek,
    dekVersion,
    contentType,
    encContentIv,
    encName,
    encCreatedAt,
    encLastModifiedAt,
    categories,
  } = await getFileInformation(userId, id);
  return json(
    fileInfoResponse.parse({
      parent: parentId,
      mekVersion,
      dek: encDek,
      dekVersion: dekVersion.toISOString(),
      contentType: contentType,
      contentIv: encContentIv,
      name: encName.ciphertext,
      nameIv: encName.iv,
      createdAt: encCreatedAt?.ciphertext,
      createdAtIv: encCreatedAt?.iv,
      lastModifiedAt: encLastModifiedAt.ciphertext,
      lastModifiedAtIv: encLastModifiedAt.iv,
      categories,
    } satisfies FileInfoResponse),
  );
};
