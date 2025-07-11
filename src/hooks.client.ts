import type { ClientInit } from "@sveltejs/kit";
import { cleanupDanglingInfos, getClientKey, getMasterKeys, getHmacSecrets } from "$lib/indexedDB";
import { prepareFileCache } from "$lib/modules/file";
import { prepareOpfs } from "$lib/modules/opfs";
import { clientKeyStore, masterKeyStore, hmacSecretStore } from "$lib/stores";

const requestPersistentStorage = async () => {
  const isPersistent = await navigator.storage.persist();
  if (isPersistent) {
    console.log("[ArkVault] Persistent storage granted.");
  } else {
    console.warn("[ArkVault] Persistent storage not granted.");
  }
};

const prepareClientKeyStore = async () => {
  const [encryptKey, decryptKey, signKey, verifyKey] = await Promise.all([
    getClientKey("encrypt"),
    getClientKey("decrypt"),
    getClientKey("sign"),
    getClientKey("verify"),
  ]);
  if (encryptKey && decryptKey && signKey && verifyKey) {
    clientKeyStore.set({ encryptKey, decryptKey, signKey, verifyKey });
  }
};

const prepareMasterKeyStore = async () => {
  const masterKeys = await getMasterKeys();
  if (masterKeys.length > 0) {
    masterKeyStore.set(new Map(masterKeys.map((masterKey) => [masterKey.version, masterKey])));
  }
};

const prepareHmacSecretStore = async () => {
  const hmacSecrets = await getHmacSecrets();
  if (hmacSecrets.length > 0) {
    hmacSecretStore.set(new Map(hmacSecrets.map((hmacSecret) => [hmacSecret.version, hmacSecret])));
  }
};

export const init: ClientInit = async () => {
  await Promise.all([
    requestPersistentStorage(),
    prepareFileCache(),
    prepareClientKeyStore(),
    prepareMasterKeyStore(),
    prepareHmacSecretStore(),
    prepareOpfs(),
  ]);

  cleanupDanglingInfos(); // Intended
};
