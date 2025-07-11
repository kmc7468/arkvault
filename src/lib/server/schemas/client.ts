import { z } from "zod";

export const clientListResponse = z.object({
  clients: z.array(
    z.object({
      id: z.number().int().positive(),
      state: z.enum(["pending", "active"]),
    }),
  ),
});
export type ClientListResponse = z.output<typeof clientListResponse>;

export const clientRegisterRequest = z.object({
  encPubKey: z.string().base64().nonempty(),
  sigPubKey: z.string().base64().nonempty(),
});
export type ClientRegisterRequest = z.input<typeof clientRegisterRequest>;

export const clientRegisterResponse = z.object({
  id: z.number().int().positive(),
  challenge: z.string().base64().nonempty(),
});
export type ClientRegisterResponse = z.output<typeof clientRegisterResponse>;

export const clientRegisterVerifyRequest = z.object({
  id: z.number().int().positive(),
  answerSig: z.string().base64().nonempty(),
});
export type ClientRegisterVerifyRequest = z.input<typeof clientRegisterVerifyRequest>;

export const clientStatusResponse = z.object({
  id: z.number().int().positive(),
  state: z.enum(["pending", "active"]),
  isInitialMekNeeded: z.boolean(),
});
export type ClientStatusResponse = z.output<typeof clientStatusResponse>;
