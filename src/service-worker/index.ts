import { self } from "$app/service-worker";
import {
  DECRYPTED_FILE_URL_PREFIX,
  type ServiceWorkerMessage,
  type ServiceWorkerResponse,
} from "#lib/shared/service-worker.ts";
import { decryptFile } from "./handlers/index.ts";
import { fileMetadataStore } from "./stores.ts";

self.addEventListener("message", (event) => {
  const message: ServiceWorkerMessage = event.data;
  switch (message.type) {
    case "decryption-prepare":
      fileMetadataStore.set(message.fileId, message);
      event.source?.postMessage({
        type: "decryption-ready",
        fileId: message.fileId,
      } satisfies ServiceWorkerResponse);
      break;
    default: {
      const exhaustive: never = message.type;
      return exhaustive;
    }
  }
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith(DECRYPTED_FILE_URL_PREFIX)) {
    event.respondWith(decryptFile(event.request, event.clientId));
  }
});

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
