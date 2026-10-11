import { self } from "$app/service-worker";
import type { FileMetadata, ServiceWorkerResponse } from "#lib/shared/service-worker.ts";
import { fileMetadataStore } from "../stores.ts";

const METADATA_REQUEST_TIMEOUT_MS = 3000;

const requestFromClient = (client: Client, fileId: number) => {
  return new Promise<FileMetadata | null>((resolve) => {
    const channel = new MessageChannel();
    const timeout = setTimeout(() => {
      channel.port1.close();
      resolve(null);
    }, METADATA_REQUEST_TIMEOUT_MS);

    channel.port1.onmessage = (event: MessageEvent<FileMetadata | null>) => {
      clearTimeout(timeout);
      channel.port1.close();
      resolve(event.data);
    };
    client.postMessage(
      { type: "decryption-metadata-request", fileId } satisfies ServiceWorkerResponse,
      [channel.port2],
    );
  });
};

export const getFileMetadata = async (fileId: number, clientId: string) => {
  const cached = fileMetadataStore.get(fileId);
  if (cached) return cached;

  // The worker might have been restarted since the client prepared the decryption
  const requestingClient = clientId ? await self.clients.get(clientId) : undefined;
  const windowClients = await self.clients.matchAll({ type: "window" });
  const candidates = [
    ...(requestingClient ? [requestingClient] : []),
    ...windowClients.filter(({ id }) => id !== requestingClient?.id),
  ];

  for (const client of candidates) {
    const metadata = await requestFromClient(client, fileId);
    if (metadata) {
      fileMetadataStore.set(fileId, metadata);
      return metadata;
    }
  }
};
