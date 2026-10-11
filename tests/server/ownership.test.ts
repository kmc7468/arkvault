import { beforeEach, describe, expect, it } from "vitest";
import { CategoryRepo, DirectoryRepo, UploadRepo, IntegrityError } from "#lib/server/db/index.ts";
import {
  createCategory,
  createDirectory,
  createUser,
  newEntryParams,
  resetDatabase,
  ciphertext,
} from "../helpers/database.ts";

beforeEach(resetDatabase);

describe("parent ownership", () => {
  it("allows creating a directory under the user's own directory", async () => {
    const { userId } = await createUser();
    const parentId = await createDirectory(userId);

    await DirectoryRepo.registerDirectory(newEntryParams(userId, parentId));

    const directories = await DirectoryRepo.getAllDirectoriesByParent(userId, parentId);
    expect(directories).toHaveLength(1);
  });

  it("rejects creating a directory under another user's directory", async () => {
    const { userId: victimId } = await createUser();
    const { userId: attackerId } = await createUser();
    const victimDirectoryId = await createDirectory(victimId);

    await expect(
      DirectoryRepo.registerDirectory(newEntryParams(attackerId, victimDirectoryId)),
    ).rejects.toThrow(new IntegrityError("Directory not found"));
  });

  it("rejects creating a category under another user's category", async () => {
    const { userId: victimId } = await createUser();
    const { userId: attackerId } = await createUser();
    const victimCategoryId = await createCategory(victimId);

    await expect(
      CategoryRepo.registerCategory(newEntryParams(attackerId, victimCategoryId)),
    ).rejects.toThrow(new IntegrityError("Category not found"));
  });

  it("rejects uploading a file into another user's directory", async () => {
    const { userId: victimId } = await createUser();
    const { userId: attackerId } = await createUser();
    const victimDirectoryId = await createDirectory(victimId);

    await expect(
      UploadRepo.createFileUploadSession({
        ...newEntryParams(attackerId, victimDirectoryId),
        id: crypto.randomUUID(),
        path: "unused",
        totalChunks: 1,
        expiresAt: new Date(Date.now() + 60_000),
        hskVersion: null,
        contentType: "image/png",
        encCreatedAt: null,
        encLastModifiedAt: ciphertext(),
      }),
    ).rejects.toThrow(new IntegrityError("Directory not found"));
  });
});
