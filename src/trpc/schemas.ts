import { z } from "zod";

export const IdSchema = z.int().positive();
export const DirectoryIdSchema = z.union([z.literal("root"), IdSchema]);
export const CategoryIdSchema = z.union([z.literal("root"), IdSchema]);
export const Base64Schema = z.base64().nonempty();

export const EncryptedNameSchema = {
  name: Base64Schema,
  nameIv: Base64Schema,
};

export const toCiphertext = (ciphertext: string, iv: string) => ({ ciphertext, iv });
