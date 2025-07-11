import { z } from "zod";

export const masterKeyListResponse = z.object({
  meks: z.array(
    z.object({
      version: z.number().int().positive(),
      state: z.enum(["active", "retired"]),
      mek: z.string().base64().nonempty(),
      mekSig: z.string().base64().nonempty(),
    }),
  ),
});
export type MasterKeyListResponse = z.output<typeof masterKeyListResponse>;

export const initialMasterKeyRegisterRequest = z.object({
  mek: z.string().base64().nonempty(),
  mekSig: z.string().base64().nonempty(),
});
export type InitialMasterKeyRegisterRequest = z.input<typeof initialMasterKeyRegisterRequest>;
