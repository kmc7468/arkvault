import { error, json } from "@sveltejs/kit";
import { authorize } from "$lib/server/modules/auth";
import {
  directoryCreateRequest,
  directoryCreateResponse,
  type DirectoryCreateResponse,
} from "$lib/server/schemas";
import { createDirectory } from "$lib/server/services/directory";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ locals, request }) => {
  const { userId } = await authorize(locals, "activeClient");

  const zodRes = directoryCreateRequest.safeParse(await request.json());
  if (!zodRes.success) error(400, "Invalid request body");
  const { parent, mekVersion, dek, dekVersion, name, nameIv } = zodRes.data;

  const { id } = await createDirectory({
    userId,
    parentId: parent,
    mekVersion,
    encDek: dek,
    dekVersion: new Date(dekVersion),
    encName: { ciphertext: name, iv: nameIv },
  });
  return json(directoryCreateResponse.parse({ directory: id } satisfies DirectoryCreateResponse));
};
