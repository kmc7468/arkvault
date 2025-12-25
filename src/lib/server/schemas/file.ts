import mime from "mime";
import { z } from "zod";
import { directoryIdSchema } from "./directory";

export const fileThumbnailUploadRequest = z.object({
  dekVersion: z.iso.datetime(),
  contentIv: z.base64().nonempty(),
});
export type FileThumbnailUploadRequest = z.input<typeof fileThumbnailUploadRequest>;

export const fileUploadRequest = z.object({
  parent: directoryIdSchema,
  mekVersion: z.int().positive(),
  dek: z.base64().nonempty(),
  dekVersion: z.iso.datetime(),
  hskVersion: z.int().positive(),
  contentHmac: z.base64().nonempty(),
  contentType: z
    .string()
    .trim()
    .nonempty()
    .refine((value) => mime.getExtension(value) !== null), // MIME type
  contentIv: z.base64().nonempty(),
  name: z.base64().nonempty(),
  nameIv: z.base64().nonempty(),
  createdAt: z.base64().nonempty().optional(),
  createdAtIv: z.base64().nonempty().optional(),
  lastModifiedAt: z.base64().nonempty(),
  lastModifiedAtIv: z.base64().nonempty(),
});
export type FileUploadRequest = z.input<typeof fileUploadRequest>;

export const fileUploadResponse = z.object({
  file: z.int().positive(),
});
export type FileUploadResponse = z.output<typeof fileUploadResponse>;
