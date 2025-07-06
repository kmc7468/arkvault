import { z } from "zod";

export const clientListResponse = z.object({
  clients: z.array(
    z.object({
      id: z.number().int().positive(),
      state: z.enum(["pending", "active"]),
    }),
  ),
});
export type ClientListResponse = z.infer<typeof clientListResponse>;

export const clientRegisterRequest = z.object({
  encPubKey: z.string().base64().nonempty(),
  sigPubKey: z.string().base64().nonempty(),
});
export type ClientRegisterRequest = z.infer<typeof clientRegisterRequest>;

export const clientRegisterResponse = z.object({
  id: z.number().int().positive(),
  challenge: z.string().base64().nonempty(),
});
export type ClientRegisterResponse = z.infer<typeof clientRegisterResponse>;

export const clientRegisterVerifyRequest = z.object({
  id: z.number().int().positive(),
  answerSig: z.string().base64().nonempty(),
});
export type ClientRegisterVerifyRequest = z.infer<typeof clientRegisterVerifyRequest>;

export const clientStatusResponse = z.object({
  id: z.number().int().positive(),
  state: z.enum(["pending", "active"]),
  isInitialMekNeeded: z.boolean(),
});
export type ClientStatusResponse = z.infer<typeof clientStatusResponse>;
