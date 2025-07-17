import { z } from "zod";

export const directoryIdSchema = z.union([z.literal("root"), z.number().int().positive()]);

export const directoryInfoResponse = z.object({
  metadata: z
    .object({
      parent: directoryIdSchema,
      mekVersion: z.number().int().positive(),
      dek: z.string().base64().nonempty(),
      dekVersion: z.string().datetime(),
      name: z.string().base64().nonempty(),
      nameIv: z.string().base64().nonempty(),
    })
    .optional(),
  subDirectories: z.number().int().positive().array(),
  files: z.number().int().positive().array(),
});
export type DirectoryInfoResponse = z.output<typeof directoryInfoResponse>;

export const directoryDeleteResponse = z.object({
  deletedDirectories: z.number().int().positive().array(),
  deletedFiles: z.number().int().positive().array(),
});
export type DirectoryDeleteResponse = z.output<typeof directoryDeleteResponse>;

export const directoryRenameRequest = z.object({
  dekVersion: z.string().datetime(),
  name: z.string().base64().nonempty(),
  nameIv: z.string().base64().nonempty(),
});
export type DirectoryRenameRequest = z.input<typeof directoryRenameRequest>;

export const directoryCreateRequest = z.object({
  parent: directoryIdSchema,
  mekVersion: z.number().int().positive(),
  dek: z.string().base64().nonempty(),
  dekVersion: z.string().datetime(),
  name: z.string().base64().nonempty(),
  nameIv: z.string().base64().nonempty(),
});
export type DirectoryCreateRequest = z.input<typeof directoryCreateRequest>;

export const directoryCreateResponse = z.object({
  directory: z.number().int().positive(),
});
export type DirectoryCreateResponse = z.output<typeof directoryCreateResponse>;
