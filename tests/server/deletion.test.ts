import { access } from "fs/promises";
import { beforeEach, describe, expect, it } from "vitest";
import { UploadRepo } from "#lib/server/db/index.ts";
import { processPendingFileDeletions } from "#lib/server/services/file-deletion.ts";
import { DirectoryService, FileService } from "#lib/server/services/index.ts";
import {
  ciphertext,
  createDirectory,
  createFile,
  createUser,
  getQueuedDeletions,
  newEntryParams,
  resetDatabase,
} from "../helpers/database.ts";
import { createStoredFile } from "../helpers/storage.ts";

const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

beforeEach(resetDatabase);

describe("file deletion", () => {
  it("deletes the stored file after the database row is deleted", async () => {
    const { userId } = await createUser();
    const path = await createStoredFile();
    const fileId = await createFile(userId, "root", path);

    await FileService.deleteFile(userId, fileId);
    await processPendingFileDeletions();

    expect(await exists(path)).toBe(false);
    expect(await getQueuedDeletions()).toEqual([]);
  });

  it("keeps failed deletions in the queue", async () => {
    const { userId } = await createUser();
    const fileId = await createFile(userId, "root", "/proc/version"); // Can't be deleted

    await FileService.deleteFile(userId, fileId);
    await processPendingFileDeletions();

    expect(await getQueuedDeletions()).toEqual(["/proc/version"]);
  });

  it("deletes directories recursively including pending uploads", async () => {
    const { userId } = await createUser();
    const rootId = await createDirectory(userId);
    const childId = await createDirectory(userId, rootId);
    const grandchildId = await createDirectory(userId, childId);
    const otherId = await createDirectory(userId);

    const paths = await Promise.all([1, 2, 3, 4].map(() => createStoredFile()));
    const fileIds = [
      await createFile(userId, rootId, paths[0]!),
      await createFile(userId, grandchildId, paths[1]!),
    ];
    const otherFileId = await createFile(userId, otherId, paths[2]!);
    await UploadRepo.createFileUploadSession({
      ...newEntryParams(userId, childId),
      id: crypto.randomUUID(),
      path: paths[3]!,
      totalChunks: 1,
      expiresAt: new Date(Date.now() + 60_000),
      hskVersion: null,
      contentType: "image/png",
      encCreatedAt: null,
      encLastModifiedAt: ciphertext(),
    });

    const { deletedFileIds } = await DirectoryService.deleteDirectory(userId, rootId);

    expect(deletedFileIds.sort()).toEqual(fileIds.sort());
    expect(await getQueuedDeletions()).toEqual([paths[0], paths[1], paths[3]].sort());
    await expect(DirectoryService.getDirectory(userId, grandchildId)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect((await FileService.getFile(userId, otherFileId)).id).toBe(otherFileId);
  });

  it("rejects deleting another user's directory", async () => {
    const { userId: ownerId } = await createUser();
    const { userId: otherId } = await createUser();
    const directoryId = await createDirectory(ownerId);

    await expect(DirectoryService.deleteDirectory(otherId, directoryId)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
