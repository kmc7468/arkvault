import { limitFunction } from "p-limit";
import { SvelteMap } from "svelte/reactivity";
import { CHUNK_SIZE } from "$lib/constants";
import type { FileInfo } from "$lib/modules/filesystem";
import { uploadBlob } from "$lib/modules/upload";
import { requestFileDownload } from "$lib/services/file";
import { Scheduler } from "$lib/utils";
import { trpc } from "$trpc/client";

export type MigrationStatus =
  | "queued"
  | "downloading"
  | "upload-pending"
  | "uploading"
  | "uploaded"
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
    if (state.status === "uploaded" || state.status === "error") {
      states.delete(id);
    }
  }
};

const requestFileUpload = limitFunction(
  async (
    state: MigrationState,
    fileId: number,
    fileBuffer: ArrayBuffer,
    dataKey: CryptoKey,
    dataKeyVersion: Date,
  ) => {
    state.status = "uploading";

    const { uploadId } = await trpc().upload.startMigrationUpload.mutate({
      file: fileId,
      chunks: Math.ceil(fileBuffer.byteLength / CHUNK_SIZE),
      dekVersion: dataKeyVersion,
    });

    await uploadBlob(uploadId, new Blob([fileBuffer]), dataKey, {
      onProgress(s) {
        state.progress = s.progress;
        state.rate = s.rate;
      },
    });

    await trpc().upload.completeMigrationUpload.mutate({ uploadId });
    state.status = "uploaded";
  },
  { concurrency: 1 },
);

export const requestFileMigration = async (fileInfo: FileInfo) => {
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
    const dataKey = fileInfo.dataKey;
    if (!dataKey) {
      throw new Error("Data key not available");
    }

    let fileBuffer: ArrayBuffer | undefined;

    await scheduler.schedule(
      async () => {
        state.status = "downloading";
        fileBuffer = await requestFileDownload(fileInfo.id, dataKey.key, true);
        return fileBuffer.byteLength;
      },
      () => requestFileUpload(state, fileInfo.id, fileBuffer!, dataKey.key, dataKey.version),
    );
  } catch (e) {
    state.status = "error";
    throw e;
  }
};
