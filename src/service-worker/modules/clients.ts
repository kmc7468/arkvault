import { self } from "$app/service-worker";
import type { ServiceWorkerResponse } from "#lib/shared/serviceWorker.js";

// Posts the message to the client that made the request, or to all windows if unknown
// (e.g. downloads by navigation)
export const notifyClients = async (clientId: string, message: ServiceWorkerResponse) => {
  const client = clientId ? await self.clients.get(clientId) : undefined;
  const clients = client ? [client] : await self.clients.matchAll({ type: "window" });
  clients.forEach((client) => client.postMessage(message));
};
