import mime from "mime";
import { z } from "zod";
import { directoryIdSchema } from "./directory";

export const fileThumbnailUploadRequest = z.object({
  dekVersion: z.string().datetime(),
  contentIv: z.string().base64().nonempty(),
});
export type FileThumbnailUploadRequest = z.input<typeof fileThumbnailUploadRequest>;

export const fileUploadRequest = z.object({
  parent: directoryIdSchema,
  mekVersion: z.number().int().positive(),
  dek: z.string().base64().nonempty(),
  dekVersion: z.string().datetime(),
  hskVersion: z.number().int().positive(),
  contentHmac: z.string().base64().nonempty(),
  contentType: z
    .string()
    .trim()
    .nonempty()
    .refine((value) => mime.getExtension(value) !== null), // MIME type
  contentIv: z.string().base64().nonempty(),
  name: z.string().base64().nonempty(),
  nameIv: z.string().base64().nonempty(),
  createdAt: z.string().base64().nonempty().optional(),
  createdAtIv: z.string().base64().nonempty().optional(),
  lastModifiedAt: z.string().base64().nonempty(),
  lastModifiedAtIv: z.string().base64().nonempty(),
});
export type FileUploadRequest = z.input<typeof fileUploadRequest>;

export const fileUploadResponse = z.object({
  file: z.number().int().positive(),
});
export type FileUploadResponse = z.output<typeof fileUploadResponse>;
