import axios from "axios";
import pLimit from "p-limit";
import { ENCRYPTION_OVERHEAD, CHUNK_SIZE } from "$lib/constants";
import { encryptChunk, digestMessage, encodeToBase64 } from "$lib/modules/crypto";

interface UploadStats {
  progress: number;
  rate: number;
}

const createSpeedMeter = (timeWindow = 1500) => {
  const samples: { t: number; b: number }[] = [];
  let lastSpeed = 0;

  return (bytesNow?: number) => {
    if (!bytesNow) return lastSpeed;

    const now = performance.now();
    samples.push({ t: now, b: bytesNow });

    const cutoff = now - timeWindow;
    while (samples.length > 2 && samples[0]!.t < cutoff) samples.shift();

    const first = samples[0]!;
    const dt = now - first.t;
    const db = bytesNow - first.b;

    lastSpeed = dt > 0 ? (db / dt) * 1000 : 0;
    return lastSpeed;
  };
};

const uploadChunk = async (
  uploadId: string,
  chunkIndex: number,
  chunk: Blob,
  dataKey: CryptoKey,
  onChunkProgress: (chunkIndex: number, loaded: number) => void,
) => {
  const chunkEncrypted = await encryptChunk(await chunk.arrayBuffer(), dataKey);
  const chunkEncryptedHash = encodeToBase64(await digestMessage(chunkEncrypted));

  await axios.post(`/api/upload/${uploadId}/chunks/${chunkIndex}`, chunkEncrypted, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Digest": `sha-256=:${chunkEncryptedHash}:`,
    },
    onUploadProgress(e) {
      onChunkProgress(chunkIndex, e.loaded ?? 0);
    },
  });

  onChunkProgress(chunkIndex, chunkEncrypted.byteLength);
};

export const uploadBlob = async (
  uploadId: string,
  blob: Blob,
  dataKey: CryptoKey,
  options?: { concurrency?: number; onProgress?: (s: UploadStats) => void },
) => {
  const onProgress = options?.onProgress;

  const totalChunks = Math.ceil(blob.size / CHUNK_SIZE);
  const totalBytes = blob.size + totalChunks * ENCRYPTION_OVERHEAD;

  const uploadedByChunk = new Array<number>(totalChunks).fill(0);
  const speedMeter = createSpeedMeter(1500);

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

  const limit = pLimit(options?.concurrency ?? 4);

  await Promise.all(
    Array.from({ length: totalChunks }, (_, i) =>
      limit(() =>
        uploadChunk(
          uploadId,
          i + 1,
          blob.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
          dataKey,
          onChunkProgress,
        ),
      ),
    ),
  );

  onProgress?.({ progress: 1, rate: speedMeter() });
};
