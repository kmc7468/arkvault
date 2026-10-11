import { concatenateBuffers, exportRSAKey, digestMessage } from "#lib/shared/crypto/index.js";

export { requestMasterKeyDownload } from "#lib/services/key.js";

export const generatePublicKeyFingerprint = async (encryptKey: CryptoKey, verifyKey: CryptoKey) => {
  const { key: encryptKeyBuffer } = await exportRSAKey(encryptKey);
  const { key: verifyKeyBuffer } = await exportRSAKey(verifyKey);
  const digest = await digestMessage(concatenateBuffers(encryptKeyBuffer, verifyKeyBuffer));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()
    .match(/.{1,4}/g)!
    .join(" ");
};
