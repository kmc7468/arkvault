import axios from "axios";
import pLimit from "p-limit";
import { ENCRYPTION_OVERHEAD, CHUNK_SIZE } from "$lib/constants";
import { encryptChunk, digestMessage, encodeToBase64 } from "$lib/modules/crypto";

type UploadStats = {
  progress: number; // 0..1 (암호화 후 기준)
  rateBps: number; // bytes/sec
  uploadedBytes: number;
  totalBytes: number;
};

function createSpeedMeter(windowMs = 1500) {
  const samples: Array<{ t: number; b: number }> = [];
  return (bytesNow: number) => {
    const now = performance.now();
    samples.push({ t: now, b: bytesNow });
    const cutoff = now - windowMs;
    while (samples.length > 2 && samples[0]!.t < cutoff) samples.shift();

    const first = samples[0]!;
    const dt = now - first.t;
    const db = bytesNow - first.b;
    return dt > 0 ? (db / dt) * 1000 : 0;
  };
}

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
    const rateBps = speedMeter(uploadedBytes);
    const progress = Math.min(1, uploadedBytes / totalBytes);

    onProgress({ progress, rateBps, uploadedBytes, totalBytes });
  };

  const onChunkProgress = (idx: number, loaded: number) => {
    uploadedByChunk[idx] = loaded;
    emit();
  };

  const limit = pLimit(options?.concurrency ?? 4);

  await Promise.all(
    Array.from({ length: totalChunks }, (_, chunkIndex) =>
      limit(() =>
        uploadChunk(
          uploadId,
          chunkIndex,
          blob.slice(chunkIndex * CHUNK_SIZE, (chunkIndex + 1) * CHUNK_SIZE),
          dataKey,
          onChunkProgress,
        ),
      ),
    ),
  );

  // 완료 보정
  onProgress?.({
    progress: 1,
    rateBps: 0,
    uploadedBytes: totalBytes,
    totalBytes,
  });
};
