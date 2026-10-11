import type { ClientInit } from "@sveltejs/kit/hooks";
import { prepareFileCache } from "#lib/client/cache/index.js";
import { keyring } from "#lib/client/keys/index.js";
import { listenForMetadataRequests } from "#lib/client/serviceWorker.js";
import { cleanupDanglingInfos } from "#lib/client/storage/indexedDB/index.js";

const requestPersistentStorage = async () => {
  const isPersistent = await navigator.storage.persist();
  if (isPersistent) {
    console.log("[ArkVault] Persistent storage granted.");
  } else {
    console.warn("[ArkVault] Persistent storage not granted.");
  }
};

export const init: ClientInit = async () => {
  listenForMetadataRequests();

  await Promise.all([requestPersistentStorage(), prepareFileCache(), keyring.load()]);

  cleanupDanglingInfos(); // Intended
};
