import { json } from "@sveltejs/kit";
import { authorize } from "$lib/server/modules/auth";
import { fileListResponse, type FileListResponse } from "$lib/server/schemas";
import { getFileList } from "$lib/server/services/file";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals }) => {
  const { userId } = await authorize(locals, "activeClient");
  const { files } = await getFileList(userId);
  return json(fileListResponse.parse({ files } satisfies FileListResponse));
};
