import { z } from "zod";

export const passwordChangeRequest = z.object({
  oldPassword: z.string().trim().nonempty(),
  newPassword: z.string().trim().nonempty(),
});
export type PasswordChangeRequest = z.input<typeof passwordChangeRequest>;

export const loginRequest = z.object({
  email: z.string().email(),
  password: z.string().trim().nonempty(),
});
export type LoginRequest = z.input<typeof loginRequest>;

export const sessionUpgradeRequest = z.object({
  encPubKey: z.string().base64().nonempty(),
  sigPubKey: z.string().base64().nonempty(),
});
export type SessionUpgradeRequest = z.input<typeof sessionUpgradeRequest>;

export const sessionUpgradeResponse = z.object({
  id: z.number().int().positive(),
  challenge: z.string().base64().nonempty(),
});
export type SessionUpgradeResponse = z.output<typeof sessionUpgradeResponse>;

export const sessionUpgradeVerifyRequest = z.object({
  id: z.number().int().positive(),
  answerSig: z.string().base64().nonempty(),
  force: z.boolean().default(false),
});
export type SessionUpgradeVerifyRequest = z.input<typeof sessionUpgradeVerifyRequest>;
