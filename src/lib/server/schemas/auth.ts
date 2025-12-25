import { z } from "zod";

export const passwordChangeRequest = z.object({
  oldPassword: z.string().trim().nonempty(),
  newPassword: z.string().trim().nonempty(),
});
export type PasswordChangeRequest = z.input<typeof passwordChangeRequest>;

export const loginRequest = z.object({
  email: z.email(),
  password: z.string().trim().nonempty(),
});
export type LoginRequest = z.input<typeof loginRequest>;

export const sessionUpgradeRequest = z.object({
  encPubKey: z.base64().nonempty(),
  sigPubKey: z.base64().nonempty(),
});
export type SessionUpgradeRequest = z.input<typeof sessionUpgradeRequest>;

export const sessionUpgradeResponse = z.object({
  id: z.int().positive(),
  challenge: z.base64().nonempty(),
});
export type SessionUpgradeResponse = z.output<typeof sessionUpgradeResponse>;

export const sessionUpgradeVerifyRequest = z.object({
  id: z.int().positive(),
  answerSig: z.base64().nonempty(),
  force: z.boolean().default(false),
});
export type SessionUpgradeVerifyRequest = z.input<typeof sessionUpgradeVerifyRequest>;
