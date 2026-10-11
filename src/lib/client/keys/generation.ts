import {
  concatenateBuffers,
  digestMessage,
  exportRSAKey,
  exportRSAKeyToBase64,
  generateEncryptionKeyPair,
  generateHmacSecret,
  generateMasterKey,
  generateSigningKeyPair,
  importEncryptionKeyPairFromBase64,
  importSigningKeyPairFromBase64,
  makeAESKeyNonextractable,
  makeRSAKeyNonextractable,
  wrapHmacSecret,
  wrapMasterKey,
} from "#lib/shared/crypto/index.js";
import { keyring } from "./keyring.svelte";
import { deserializeClientKeys } from "./serialization";

// Generates new client keys and keeps them in the keyring without persisting
export const generateClientKeys = async () => {
  const { encryptKey, decryptKey } = await generateEncryptionKeyPair();
  const { signKey, verifyKey } = await generateSigningKeyPair();

  keyring.setClientKeys({
    encryptKey,
    decryptKey: await makeRSAKeyNonextractable(decryptKey),
    signKey: await makeRSAKeyNonextractable(signKey),
    verifyKey,
  });

  return {
    encryptKey,
    encryptKeyBase64: await exportRSAKeyToBase64(encryptKey),
    decryptKeyBase64: await exportRSAKeyToBase64(decryptKey),
    signKeyBase64: await exportRSAKeyToBase64(signKey),
    verifyKeyBase64: await exportRSAKeyToBase64(verifyKey),
  };
};

export const importClientKeys = async (clientKeysSerialized: string) => {
  const clientKeys = deserializeClientKeys(clientKeysSerialized);
  if (!clientKeys) return false;

  const { encryptKey, decryptKey } = await importEncryptionKeyPairFromBase64(
    clientKeys.encryptKeyBase64,
    clientKeys.decryptKeyBase64,
  );
  const { signKey, verifyKey } = await importSigningKeyPairFromBase64(
    clientKeys.signKeyBase64,
    clientKeys.verifyKeyBase64,
  );

  keyring.setClientKeys({
    encryptKey,
    decryptKey: await makeRSAKeyNonextractable(decryptKey),
    signKey: await makeRSAKeyNonextractable(signKey),
    verifyKey,
  });
  return true;
};

export const generateInitialMasterKey = async (encryptKey: CryptoKey) => {
  const { masterKey } = await generateMasterKey();
  return {
    masterKey: await makeAESKeyNonextractable(masterKey),
    masterKeyWrapped: await wrapMasterKey(masterKey, encryptKey),
  };
};

export const generateInitialHmacSecret = async (masterKey: CryptoKey) => {
  const { hmacSecret } = await generateHmacSecret();
  return {
    hmacSecretWrapped: await wrapHmacSecret(hmacSecret, masterKey),
  };
};

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
