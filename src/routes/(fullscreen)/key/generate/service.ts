import {
  generateEncryptionKeyPair,
  generateSigningKeyPair,
  exportRSAKeyToBase64,
  importEncryptionKeyPairFromBase64,
  importSigningKeyPairFromBase64,
  makeRSAKeyNonextractable,
  wrapMasterKey,
  generateMasterKey,
  makeAESKeyNonextractable,
  wrapHmacSecret,
  generateHmacSecret,
} from "$lib/modules/crypto";
import { deserializeClientKeys } from "$lib/modules/key";
import { clientKeyStore } from "$lib/stores";

export { requestLogout } from "$lib/services/auth";
export {
  requestClientRegistrationAndSessionUpgrade,
  requestInitialMasterKeyAndHmacSecretRegistration,
} from "$lib/services/key";

export const generateClientKeys = async () => {
  const { encryptKey, decryptKey } = await generateEncryptionKeyPair();
  const { signKey, verifyKey } = await generateSigningKeyPair();

  clientKeyStore.set({
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

  clientKeyStore.set({
    encryptKey,
    decryptKey: await makeRSAKeyNonextractable(decryptKey),
    signKey: await makeRSAKeyNonextractable(signKey),
    verifyKey,
  });
  return true;
};
