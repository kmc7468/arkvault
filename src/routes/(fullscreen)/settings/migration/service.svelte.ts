import { limitFunction } from "p-limit";
import { SvelteMap } from "svelte/reactivity";
import { CHUNK_SIZE } from "$lib/constants";
import { encodeToBase64, encryptChunk, digestMessage } from "$lib/modules/crypto";
import { deleteFileCache } from "$lib/modules/file";
import type { FileInfo } from "$lib/modules/filesystem";
import { Scheduler } from "$lib/modules/scheduler";
import { requestFileDownload } from "$lib/services/file";
import { trpc } from "$trpc/client";

export type MigrationStatus =
  | "queued"
  | "download-pending"
  | "downloading"
  | "encryption-pending"
  | "encrypting"
  | "upload-pending"
  | "uploading"
  | "completed"
  | "error";

export interface MigrationState {
  status: MigrationStatus;
  progress?: number;
  rate?: number;
}

const scheduler = new Scheduler();
const states = new SvelteMap<number, MigrationState>();

const createState = (status: MigrationStatus): MigrationState => {
  const state = $state({ status });
  return state;
};

export const getMigrationState = (fileId: number) => {
  return states.get(fileId);
};

export const clearMigrationStates = () => {
  for (const [id, state] of states) {
    if (state.status === "completed" || state.status === "error") {
      states.delete(id);
    }
  }
};

const encryptChunks = async (fileBuffer: ArrayBuffer, dataKey: CryptoKey) => {
  const chunksEncrypted: { chunkEncrypted: ArrayBuffer; chunkEncryptedHash: string }[] = [];
  let offset = 0;

  while (offset < fileBuffer.byteLength) {
    const nextOffset = Math.min(offset + CHUNK_SIZE, fileBuffer.byteLength);
    const chunkEncrypted = await encryptChunk(fileBuffer.slice(offset, nextOffset), dataKey);
    chunksEncrypted.push({
      chunkEncrypted: chunkEncrypted,
      chunkEncryptedHash: encodeToBase64(await digestMessage(chunkEncrypted)),
    });
    offset = nextOffset;
  }

  return chunksEncrypted;
};

const uploadMigrationChunks = limitFunction(
  async (
    state: MigrationState,
    fileId: number,
    chunksEncrypted: { chunkEncrypted: ArrayBuffer; chunkEncryptedHash: string }[],
  ) => {
    state.status = "uploading";

    const { uploadId } = await trpc().upload.startMigrationUpload.mutate({
      file: fileId,
      chunks: chunksEncrypted.length,
    });

    const totalBytes = chunksEncrypted.reduce((sum, c) => sum + c.chunkEncrypted.byteLength, 0);
    let uploadedBytes = 0;
    const startTime = Date.now();

    for (let i = 0; i < chunksEncrypted.length; i++) {
      const { chunkEncrypted, chunkEncryptedHash } = chunksEncrypted[i]!;

      const response = await fetch(`/api/upload/${uploadId}/chunks/${i}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Digest": `sha-256=:${chunkEncryptedHash}:`,
        },
        body: chunkEncrypted,
      });

      if (!response.ok) {
        throw new Error(`Chunk upload failed: ${response.status} ${response.statusText}`);
      }

      uploadedBytes += chunkEncrypted.byteLength;

      const elapsed = (Date.now() - startTime) / 1000;
      const rate = uploadedBytes / elapsed;

      state.progress = uploadedBytes / totalBytes;
      state.rate = rate;
    }

    await trpc().upload.completeMigrationUpload.mutate({ uploadId });
  },
  { concurrency: 1 },
);

const encryptFile = limitFunction(
  async (state: MigrationState, fileBuffer: ArrayBuffer, dataKey: CryptoKey) => {
    state.status = "encrypting";
    const chunksEncrypted = await encryptChunks(fileBuffer, dataKey);
    state.status = "upload-pending";
    return chunksEncrypted;
  },
  { concurrency: 4 },
);

export const requestFileMigration = async (fileInfo: FileInfo & { exists: true }) => {
  let state = states.get(fileInfo.id);
  if (state) {
    if (state.status !== "error") return;
    state.status = "queued";
    state.progress = undefined;
    state.rate = undefined;
  } else {
    state = createState("queued");
    states.set(fileInfo.id, state);
  }

  try {
    const dataKey = fileInfo.dataKey?.key;
    if (!dataKey) {
      throw new Error("Data key not available");
    }

    let fileBuffer: ArrayBuffer | undefined;

    await scheduler.schedule(
      async () => {
        state.status = "download-pending";
        state.status = "downloading";
        fileBuffer = await requestFileDownload(fileInfo.id, dataKey, true);
        return fileBuffer.byteLength;
      },
      async () => {
        state.status = "encryption-pending";
        const chunksEncrypted = await encryptFile(state, fileBuffer!, dataKey);

        await uploadMigrationChunks(state, fileInfo.id, chunksEncrypted);

        // Clear file cache since the file format has changed
        await deleteFileCache(fileInfo.id);

        state.status = "completed";
      },
    );
  } catch (e) {
    state.status = "error";
    throw e;
  }
};
