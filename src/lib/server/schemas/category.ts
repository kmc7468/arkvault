import { z } from "zod";

export const categoryIdSchema = z.union([z.literal("root"), z.number().int().positive()]);

export const categoryInfoResponse = z.object({
  metadata: z
    .object({
      parent: categoryIdSchema,
      mekVersion: z.number().int().positive(),
      dek: z.string().base64().nonempty(),
      dekVersion: z.string().datetime(),
      name: z.string().base64().nonempty(),
      nameIv: z.string().base64().nonempty(),
    })
    .optional(),
  subCategories: z.number().int().positive().array(),
});
export type CategoryInfoResponse = z.output<typeof categoryInfoResponse>;

export const categoryFileAddRequest = z.object({
  file: z.number().int().positive(),
});
export type CategoryFileAddRequest = z.input<typeof categoryFileAddRequest>;

export const categoryFileListResponse = z.object({
  files: z.array(
    z.object({
      file: z.number().int().positive(),
      isRecursive: z.boolean(),
    }),
  ),
});
export type CategoryFileListResponse = z.output<typeof categoryFileListResponse>;

export const categoryFileRemoveRequest = z.object({
  file: z.number().int().positive(),
});
export type CategoryFileRemoveRequest = z.input<typeof categoryFileRemoveRequest>;

export const categoryRenameRequest = z.object({
  dekVersion: z.string().datetime(),
  name: z.string().base64().nonempty(),
  nameIv: z.string().base64().nonempty(),
});
export type CategoryRenameRequest = z.input<typeof categoryRenameRequest>;

export const categoryCreateRequest = z.object({
  parent: categoryIdSchema,
  mekVersion: z.number().int().positive(),
  dek: z.string().base64().nonempty(),
  dekVersion: z.string().datetime(),
  name: z.string().base64().nonempty(),
  nameIv: z.string().base64().nonempty(),
});
export type CategoryCreateRequest = z.input<typeof categoryCreateRequest>;

export const categoryCreateResponse = z.object({
  category: z.number().int().positive(),
});
export type CategoryCreateResponse = z.output<typeof categoryCreateResponse>;
