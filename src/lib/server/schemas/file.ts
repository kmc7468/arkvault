import { z } from "zod";

export const fileThumbnailUploadRequest = z.object({
  dekVersion: z.iso.datetime(),
  contentIv: z.base64().nonempty(),
});
export type FileThumbnailUploadRequest = z.input<typeof fileThumbnailUploadRequest>;
