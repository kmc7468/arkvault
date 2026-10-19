import { LRUCache } from "lru-cache";
import { handleDownloadProgress } from "#lib/client/transfer/download.svelte.ts";
import {
  DECRYPTED_FILE_URL_PREFIX,
  MAX_PREPARED_FILES,
  type FileMetadata,
  type ServiceWorkerMessage,
  type ServiceWorkerResponse,
} from "#lib/shared/service-worker.ts";

const PREPARE_TIMEOUT_MS = 5000;

// The service worker may be terminated at any time, losing its in-memory metadata.
// Keep a copy here so that it can be re-requested on demand.
const preparedFiles = new LRUCache<number, FileMetadata>({ max: MAX_PREPARED_FILES });
let isListening = false;

export const listenForServiceWorkerMessages = () => {
  if (isListening) return;
  isListening = true;

  navigator.serviceWorker.addEventListener(
    "message",
    (event: MessageEvent<ServiceWorkerResponse>) => {
      switch (event.data.type) {
        case "decryption-metadata-request":
          event.ports[0]?.postMessage(preparedFiles.get(event.data.fileId) ?? null);
          break;
        case "download-progress":
          handleDownloadProgress(event.data);
          break;
      }
    },
  );
};

const getServiceWorker = async () => {
  const registration = await navigator.serviceWorker.ready;
  const sw = registration.active;
  if (!sw) {
    throw new Error("Service worker not activated");
  }
  return sw;
};

export const prepareFileDecryption = async (id: number, metadata: FileMetadata) => {
  preparedFiles.set(id, metadata);
  listenForServiceWorkerMessages();

  const sw = await getServiceWorker();
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Service worker timeout")),
      PREPARE_TIMEOUT_MS,
    );
    const handler = (event: MessageEvent<ServiceWorkerResponse>) => {
      if (event.data.type === "decryption-ready" && event.data.fileId === id) {
        clearTimeout(timeout);
        navigator.serviceWorker.removeEventListener("message", handler);
        resolve();
      }
    };
    navigator.serviceWorker.addEventListener("message", handler);

    sw.postMessage({
      type: "decryption-prepare",
      fileId: id,
      ...metadata,
    } satisfies ServiceWorkerMessage);
  });
};

export const getDecryptedFileUrl = (id: number) => `${DECRYPTED_FILE_URL_PREFIX}${id}`;

// Lets the service worker download, decrypt, and save the file
export const saveDecryptedFile = (id: number, filename: string) => {
  const link = document.createElement("a");
  link.href = `${getDecryptedFileUrl(id)}?download=${encodeURIComponent(filename)}`;
  link.click();
};
