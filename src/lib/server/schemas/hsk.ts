import { z } from "zod";

export const hmacSecretListResponse = z.object({
  hsks: z.array(
    z.object({
      version: z.number().int().positive(),
      state: z.enum(["active"]),
      mekVersion: z.number().int().positive(),
      hsk: z.string().base64().nonempty(),
    }),
  ),
});
export type HmacSecretListResponse = z.output<typeof hmacSecretListResponse>;

export const initialHmacSecretRegisterRequest = z.object({
  mekVersion: z.number().int().positive(),
  hsk: z.string().base64().nonempty(),
});
export type InitialHmacSecretRegisterRequest = z.input<typeof initialHmacSecretRegisterRequest>;
