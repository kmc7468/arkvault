import { beforeEach, describe, expect, it } from "vitest";
import { UploadRepo } from "#lib/server/db/index.js";
import { isChunkUploaded } from "#lib/server/services/upload.js";
import { ciphertext, createUser, newEntryParams, resetDatabase } from "../helpers/database";

beforeEach(resetDatabase);

describe("upload session bitmap", () => {
  it("matches the bit order of PostgreSQL's set_bit", async () => {
    const { userId } = await createUser();
    const id = crypto.randomUUID();
    await UploadRepo.createFileUploadSession({
      ...newEntryParams(userId, "root"),
      id,
      path: "unused",
      totalChunks: 20,
      expiresAt: new Date(Date.now() + 60_000),
      hskVersion: null,
      contentType: "image/png",
      encCreatedAt: null,
      encLastModifiedAt: ciphertext(),
    });

    const uploaded = [1, 8, 9, 20];
    for (const chunkIndex of uploaded) {
      await UploadRepo.markChunkAsUploaded(id, chunkIndex);
    }

    const session = await UploadRepo.getUploadSession(id, userId);
    expect(session?.uploadedChunks).toBe(uploaded.length);
    for (let chunkIndex = 1; chunkIndex <= 20; chunkIndex++) {
      expect(isChunkUploaded(session!.bitmap, chunkIndex)).toBe(uploaded.includes(chunkIndex));
    }
  });
});
