import { z } from "zod";
import { storeClientKey } from "$lib/indexedDB";
import type { ClientKeys } from "$lib/stores";

const serializedClientKeysSchema = z.intersection(
  z.object({
    generator: z.literal("ArkVault"),
    exportedAt: z.string().datetime(),
  }),
  z.object({
    version: z.literal(1),
    encryptKey: z.string().base64().nonempty(),
    decryptKey: z.string().base64().nonempty(),
    signKey: z.string().base64().nonempty(),
    verifyKey: z.string().base64().nonempty(),
  }),
);

type SerializedClientKeys = z.infer<typeof serializedClientKeysSchema>;

type DeserializedClientKeys = {
  encryptKeyBase64: string;
  decryptKeyBase64: string;
  signKeyBase64: string;
  verifyKeyBase64: string;
};

export const serializeClientKeys = ({
  encryptKeyBase64,
  decryptKeyBase64,
  signKeyBase64,
  verifyKeyBase64,
}: DeserializedClientKeys) => {
  return JSON.stringify({
    version: 1,
    generator: "ArkVault",
    exportedAt: new Date().toISOString(),
    encryptKey: encryptKeyBase64,
    decryptKey: decryptKeyBase64,
    signKey: signKeyBase64,
    verifyKey: verifyKeyBase64,
  } satisfies SerializedClientKeys);
};

export const deserializeClientKeys = (serialized: string) => {
  const zodRes = serializedClientKeysSchema.safeParse(JSON.parse(serialized));
  if (zodRes.success) {
    return {
      encryptKeyBase64: zodRes.data.encryptKey,
      decryptKeyBase64: zodRes.data.decryptKey,
      signKeyBase64: zodRes.data.signKey,
      verifyKeyBase64: zodRes.data.verifyKey,
    } satisfies DeserializedClientKeys;
  }
  return undefined;
};

export const storeClientKeys = async (clientKeys: ClientKeys) => {
  await Promise.all([
    storeClientKey(clientKeys.encryptKey, "encrypt"),
    storeClientKey(clientKeys.decryptKey, "decrypt"),
    storeClientKey(clientKeys.signKey, "sign"),
    storeClientKey(clientKeys.verifyKey, "verify"),
  ]);
};
