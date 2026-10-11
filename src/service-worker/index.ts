import { self } from "$app/service-worker";
import { DECRYPTED_FILE_URL_PREFIX } from "./constants";
import { decryptFile } from "./handlers";
import { fileMetadataStore } from "./stores";
import type { ServiceWorkerMessage, ServiceWorkerResponse } from "./types";

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
    event.respondWith(decryptFile(event.request));
  }
});

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
