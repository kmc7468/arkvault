import { sha256 } from "@noble/hashes/sha2.js";
import axios from "axios";
import { encodeToBase64, encryptChunk } from "#lib/shared/crypto/index.ts";
import { CHUNK_SIZE, getChunkCount, getEncryptedSize } from "#lib/shared/format/index.ts";
import { BoundedQueue } from "#lib/utils/concurrency/index.ts";
import { createSpeedMeter } from "#lib/utils/speed-meter.ts";

interface UploadStats {
  progress: number;
  rate: number;
}

interface EncryptedChunk {
  index: number;
  data: ArrayBuffer;
}

const uploadEncryptedChunk = async (
  uploadId: string,
  chunkIndex: number,
  encrypted: ArrayBuffer,
  onChunkProgress: (chunkIndex: number, loaded: number) => void,
) => {
  await axios.post(`/api/upload/${uploadId}/chunks/${chunkIndex + 1}`, encrypted, {
    headers: { "Content-Type": "application/octet-stream" },
    onUploadProgress(e) {
      onChunkProgress(chunkIndex, e.loaded ?? 0);
    },
  });

  onChunkProgress(chunkIndex, encrypted.byteLength);
};

export const uploadBlob = async (
  uploadId: string,
  blob: Blob,
  dataKey: CryptoKey,
  options?: {
    concurrency?: number;
    onProgress?: (s: UploadStats) => void;
    // Receives each chunk of the plaintext before it is encrypted
    onPlaintextChunk?: (chunkIndex: number, data: ArrayBuffer) => Promise<void>;
  },
) => {
  const onProgress = options?.onProgress;
  const networkConcurrency = options?.concurrency ?? 4;
  const maxQueueSize = 8;

  const totalChunks = getChunkCount(blob.size);
  const totalBytes = getEncryptedSize(blob.size);

  const uploadedByChunk = new Array<number>(totalChunks).fill(0);
  const speedMeter = createSpeedMeter(3000, 200);
  const hash = sha256.create();

  const emit = () => {
    if (!onProgress) return;

    const uploadedBytes = uploadedByChunk.reduce((a, b) => a + b, 0);
    const rate = speedMeter(uploadedBytes);
    const progress = Math.min(1, uploadedBytes / totalBytes);

    onProgress({ progress, rate });
  };

  const onChunkProgress = (idx: number, loaded: number) => {
    uploadedByChunk[idx] = loaded;
    emit();
  };

  const queue = new BoundedQueue<EncryptedChunk>(maxQueueSize);

  // Producer: encrypt chunks and push to queue
  const encryptionProducer = async () => {
    try {
      for (let i = 0; i < totalChunks; i++) {
        const chunk = await blob.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE).arrayBuffer();
        await options?.onPlaintextChunk?.(i, chunk);
        const data = await encryptChunk(chunk, dataKey);
        hash.update(new Uint8Array(data));
        await queue.push({ index: i, data });
      }
    } finally {
      queue.close();
    }
  };

  // Consumer: upload chunks from queue with concurrency limit
  const uploadConsumer = async () => {
    const activeTasks = new Set<Promise<void>>();
    let failure: { reason: unknown } | undefined;

    try {
      while (!failure) {
        const item = await queue.pop();
        if (item === null) break;

        const task: Promise<void> = uploadEncryptedChunk(
          uploadId,
          item.index,
          item.data,
          onChunkProgress,
        )
          .catch((reason) => {
            failure ??= { reason };
          })
          .finally(() => activeTasks.delete(task));
        activeTasks.add(task);

        if (activeTasks.size >= networkConcurrency) {
          await Promise.race(activeTasks);
        }
      }

      await Promise.all(activeTasks);
      if (failure) throw failure.reason;
    } finally {
      queue.close(); // Stops the producer if the upload failed
    }
  };

  // Run producer and consumer concurrently
  const [encryption, upload] = await Promise.allSettled([encryptionProducer(), uploadConsumer()]);
  // The upload error takes precedence, as the producer fails due to the closed queue then
  if (upload.status === "rejected") throw upload.reason;
  if (encryption.status === "rejected") throw encryption.reason;

  onProgress?.({ progress: 1, rate: speedMeter() });
  return { encContentHash: encodeToBase64(hash.digest()) };
};
