import axios from "axios";
import pLimit from "p-limit";
import { ENCRYPTION_OVERHEAD, CHUNK_SIZE } from "$lib/constants";
import { encryptChunk, digestMessage, encodeToBase64 } from "$lib/modules/crypto";
import { BoundedQueue } from "$lib/utils";

interface UploadStats {
  progress: number;
  rate: number;
}

interface EncryptedChunk {
  index: number;
  data: ArrayBuffer;
  hash: string;
}

const createSpeedMeter = (timeWindow = 3000, minInterval = 200, warmupPeriod = 500) => {
  const samples: { t: number; b: number }[] = [];
  let lastSpeed = 0;
  let startTime: number | null = null;

  return (bytesNow?: number) => {
    if (bytesNow === undefined) return lastSpeed;

    const now = performance.now();

    // Initialize start time on first call
    if (startTime === null) {
      startTime = now;
    }

    // Check if enough time has passed since the last sample
    const lastSample = samples[samples.length - 1];
    if (lastSample && now - lastSample.t < minInterval) {
      return lastSpeed;
    }

    samples.push({ t: now, b: bytesNow });

    // Remove old samples outside the time window
    const cutoff = now - timeWindow;
    while (samples.length > 2 && samples[0]!.t < cutoff) samples.shift();

    // Need at least 2 samples to calculate speed
    if (samples.length < 2) {
      return lastSpeed;
    }

    const first = samples[0]!;
    const dt = now - first.t;
    const db = bytesNow - first.b;

    if (dt >= minInterval) {
      const instantSpeed = (db / dt) * 1000;
      // Apply EMA for smoother speed transitions
      const alpha = 0.3;
      const rawSpeed =
        lastSpeed === 0 ? instantSpeed : alpha * instantSpeed + (1 - alpha) * lastSpeed;

      // Apply warmup ramp to prevent initial overestimation
      const elapsed = now - startTime;
      const warmupWeight = Math.min(1, elapsed / warmupPeriod);
      lastSpeed = rawSpeed * warmupWeight;
    }

    return lastSpeed;
  };
};

const encryptChunkData = async (
  chunk: Blob,
  dataKey: CryptoKey,
): Promise<{ data: ArrayBuffer; hash: string }> => {
  const encrypted = await encryptChunk(await chunk.arrayBuffer(), dataKey);
  const hash = encodeToBase64(await digestMessage(encrypted));
  return { data: encrypted, hash };
};

const uploadEncryptedChunk = async (
  uploadId: string,
  chunkIndex: number,
  encrypted: ArrayBuffer,
  hash: string,
  onChunkProgress: (chunkIndex: number, loaded: number) => void,
) => {
  await axios.post(`/api/upload/${uploadId}/chunks/${chunkIndex + 1}`, encrypted, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Digest": `sha-256=:${hash}:`,
    },
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
  options?: { concurrency?: number; onProgress?: (s: UploadStats) => void },
) => {
  const onProgress = options?.onProgress;
  const networkConcurrency = options?.concurrency ?? 4;
  const maxQueueSize = 8;

  const totalChunks = Math.ceil(blob.size / CHUNK_SIZE);
  const totalBytes = blob.size + totalChunks * ENCRYPTION_OVERHEAD;

  const uploadedByChunk = new Array<number>(totalChunks).fill(0);
  const speedMeter = createSpeedMeter(3000, 200);

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
  let encryptionError: Error | null = null;

  // Producer: encrypt chunks and push to queue
  const encryptionProducer = async () => {
    try {
      for (let i = 0; i < totalChunks; i++) {
        const chunk = blob.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        const { data, hash } = await encryptChunkData(chunk, dataKey);
        await queue.push({ index: i, data, hash });
      }
    } catch (e) {
      encryptionError = e instanceof Error ? e : new Error(String(e));
    } finally {
      queue.close();
    }
  };

  // Consumer: upload chunks from queue with concurrency limit
  const uploadConsumer = async () => {
    const limit = pLimit(networkConcurrency);
    const activeTasks = new Set<Promise<void>>();

    while (true) {
      const item = await queue.pop();
      if (item === null) break;
      if (encryptionError) throw encryptionError;

      const task = limit(async () => {
        try {
          await uploadEncryptedChunk(uploadId, item.index, item.data, item.hash, onChunkProgress);
        } finally {
          // @ts-ignore
          item.data = null;
        }
      });

      activeTasks.add(task);
      task.finally(() => activeTasks.delete(task));

      if (activeTasks.size >= networkConcurrency) {
        await Promise.race(activeTasks);
      }
    }

    await Promise.all(activeTasks);
  };

  // Run producer and consumer concurrently
  await Promise.all([encryptionProducer(), uploadConsumer()]);

  onProgress?.({ progress: 1, rate: speedMeter() });
};
