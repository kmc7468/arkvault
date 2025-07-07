import { json } from "@sveltejs/kit";
import { authorize } from "$lib/server/modules/auth";
import {
  missingThumbnailFileScanResponse,
  type MissingThumbnailFileScanResponse,
} from "$lib/server/schemas/file";
import { scanMissingFileThumbnails } from "$lib/server/services/file";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ locals }) => {
  const { userId } = await authorize(locals, "activeClient");

  const { files } = await scanMissingFileThumbnails(userId);
  return json(
    missingThumbnailFileScanResponse.parse({ files } satisfies MissingThumbnailFileScanResponse),
  );
};
