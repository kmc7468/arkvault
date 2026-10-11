import type { DownloadProgressMessage } from "#lib/shared/serviceWorker.js";
import { notifyClients } from "./clients";

const REPORT_INTERVAL_MS = 200;

// Reports the progress of reading the stream to the clients
export const trackDownloadProgress = (
  stream: ReadableStream<Uint8Array>,
  fileId: number,
  total: number,
  clientId: string,
) => {
  const reader = stream.getReader();
  let loaded = 0;
  let lastReportedAt = 0;

  const report = (status: DownloadProgressMessage["status"]) => {
    lastReportedAt = Date.now();
    void notifyClients(clientId, { type: "download-progress", fileId, status, loaded, total });
  };

  report("downloading");
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          report("completed");
          controller.close();
          return;
        }

        loaded += value.byteLength;
        if (Date.now() - lastReportedAt >= REPORT_INTERVAL_MS) {
          report("downloading");
        }
        controller.enqueue(value);
      } catch (e) {
        report("error");
        controller.error(e);
      }
    },
    async cancel(reason) {
      report("canceled");
      await reader.cancel(reason);
    },
  });
};
