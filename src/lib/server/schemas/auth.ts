import { z } from "zod";

export const passwordChangeRequest = z.object({
  oldPassword: z.string().trim().nonempty(),
  newPassword: z.string().trim().nonempty(),
});
export type PasswordChangeRequest = z.infer<typeof passwordChangeRequest>;

export const loginRequest = z.object({
  email: z.string().email(),
  password: z.string().trim().nonempty(),
});
export type LoginRequest = z.infer<typeof loginRequest>;

export const sessionUpgradeRequest = z.object({
  encPubKey: z.string().base64().nonempty(),
  sigPubKey: z.string().base64().nonempty(),
});
export type SessionUpgradeRequest = z.infer<typeof sessionUpgradeRequest>;

export const sessionUpgradeResponse = z.object({
  challenge: z.string().base64().nonempty(),
});
export type SessionUpgradeResponse = z.infer<typeof sessionUpgradeResponse>;

export const sessionUpgradeVerifyRequest = z.object({
  answer: z.string().base64().nonempty(),
  answerSig: z.string().base64().nonempty(),
});
export type SessionUpgradeVerifyRequest = z.infer<typeof sessionUpgradeVerifyRequest>;
