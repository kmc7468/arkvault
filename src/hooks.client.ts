import type { ClientInit } from "@sveltejs/kit/hooks";
import { cleanupFileCaches } from "#lib/client/cache/index.ts";
import { keyring } from "#lib/client/keys/index.ts";
import { listenForServiceWorkerMessages } from "#lib/client/service-worker.ts";
import { cleanupDanglingInfos } from "#lib/client/storage/indexed-db/index.ts";

const requestPersistentStorage = async () => {
  const isPersistent = await navigator.storage.persist();
  if (isPersistent) {
    console.log("[ArkVault] Persistent storage granted.");
  } else {
    console.warn("[ArkVault] Persistent storage not granted.");
  }
};

export const init: ClientInit = async () => {
  listenForServiceWorkerMessages();

  await Promise.all([requestPersistentStorage(), keyring.load()]);

  cleanupDanglingInfos(); // Intended
  cleanupFileCaches().catch(console.error);
};
