import { beforeEach, describe, expect, it } from "vitest";
import { CategoryService, DirectoryService, UploadService } from "#lib/server/services/index.ts";
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

    await DirectoryService.createDirectory(newEntryParams(userId, parentId));

    const { subDirectories } = await DirectoryService.getDirectory(userId, parentId);
    expect(subDirectories).toHaveLength(1);
  });

  it("rejects creating a directory under another user's directory", async () => {
    const { userId: victimId } = await createUser();
    const { userId: attackerId } = await createUser();
    const victimDirectoryId = await createDirectory(victimId);

    await expect(
      DirectoryService.createDirectory(newEntryParams(attackerId, victimDirectoryId)),
    ).rejects.toMatchObject({ code: "NOT_FOUND", message: "Directory not found" });
  });

  it("rejects creating a category under another user's category", async () => {
    const { userId: victimId } = await createUser();
    const { userId: attackerId } = await createUser();
    const victimCategoryId = await createCategory(victimId);

    await expect(
      CategoryService.createCategory(newEntryParams(attackerId, victimCategoryId)),
    ).rejects.toMatchObject({ code: "NOT_FOUND", message: "Category not found" });
  });

  it("rejects uploading a file into another user's directory", async () => {
    const { userId: victimId } = await createUser();
    const { userId: attackerId } = await createUser();
    const victimDirectoryId = await createDirectory(victimId);

    await expect(
      UploadService.startFileUpload({
        ...newEntryParams(attackerId, victimDirectoryId),
        totalChunks: 1,
        hskVersion: null,
        contentType: "image/png",
        encCreatedAt: null,
        encLastModifiedAt: ciphertext(),
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", message: "Directory not found" });
  });
});
