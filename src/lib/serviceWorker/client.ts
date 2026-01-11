import { DECRYPTED_FILE_URL_PREFIX } from "$lib/constants";
import type { FileMetadata, ServiceWorkerMessage, ServiceWorkerResponse } from "./types";

const PREPARE_TIMEOUT_MS = 5000;

const getServiceWorker = async () => {
  const registration = await navigator.serviceWorker.ready;
  const sw = registration.active;
  if (!sw) {
    throw new Error("Service worker not activated");
  }
  return sw;
};

export const prepareFileDecryption = async (id: number, metadata: FileMetadata) => {
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
