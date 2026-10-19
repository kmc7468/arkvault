import { createHash } from "crypto";
import { Readable } from "stream";
import { beforeEach, describe, expect, it } from "vitest";
import { UploadRepo, db } from "#lib/server/db/index.ts";
import { FileService, UploadService } from "#lib/server/services/index.ts";
import { isChunkUploaded } from "#lib/server/services/upload.ts";
import { hashFile } from "#lib/server/storage/index.ts";
import { ciphertext, createUser, newEntryParams, resetDatabase } from "../helpers/database.ts";

beforeEach(resetDatabase);

describe("upload session bitmap", () => {
  it("matches the bit order of PostgreSQL's set_bit", async () => {
    const { userId } = await createUser();
    const id = crypto.randomUUID();
    await UploadRepo.createFileUploadSession(db, {
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
      await UploadRepo.markChunkAsUploaded(db, id, chunkIndex);
    }

    const session = await UploadRepo.getUploadSession(db, id, userId);
    expect(session?.uploadedChunks).toBe(uploaded.length);
    for (let chunkIndex = 1; chunkIndex <= 20; chunkIndex++) {
      expect(isChunkUploaded(session!.bitmap, chunkIndex)).toBe(uploaded.includes(chunkIndex));
    }
  });
});

describe("upload completion", () => {
  it.each([false, true])(
    "rejects a late duplicate without changing the file (completed: %s)",
    async (completeBeforeDuplicate) => {
      const { userId } = await createUser();
      const { uploadId } = await UploadService.startFileUpload({
        ...newEntryParams(userId, "root"),
        totalChunks: 1,
        hskVersion: null,
        contentType: "image/png",
        encCreatedAt: null,
        encLastModifiedAt: ciphertext(),
      });
      const session = (await UploadRepo.getUploadSession(db, uploadId, userId))!;
      const started = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const duplicate = UploadService.uploadChunk(
        userId,
        uploadId,
        1,
        Readable.from(
          (async function* () {
            started.resolve();
            await release.promise;
            yield Buffer.alloc(100, 2);
          })(),
        ),
      );
      await started.promise;

      try {
        const chunk = Buffer.alloc(100, 1);
        const hash = createHash("sha256").update(chunk).digest("base64");
        await UploadService.uploadChunk(userId, uploadId, 1, Readable.from([chunk]));
        if (completeBeforeDuplicate) {
          await UploadService.completeFileUpload(userId, uploadId, null, hash);
        }

        const rejected = expect(duplicate).rejects.toMatchObject({
          code: completeBeforeDuplicate ? "NOT_FOUND" : "CONFLICT",
        });
        release.resolve();
        await rejected;
        expect(await hashFile(session.path)).toBe(hash);

        if (!completeBeforeDuplicate) {
          await UploadService.completeFileUpload(userId, uploadId, null, hash);
        }
        expect(await FileService.getAllFileIds(userId)).toHaveLength(1);
      } finally {
        release.resolve();
        await duplicate.catch(() => {});
      }
    },
  );

  it("registers the file only once when completed concurrently", async () => {
    const { userId } = await createUser();
    const { uploadId } = await UploadService.startFileUpload({
      ...newEntryParams(userId, "root"),
      totalChunks: 1,
      hskVersion: null,
      contentType: "image/png",
      encCreatedAt: null,
      encLastModifiedAt: ciphertext(),
    });

    const chunk = Buffer.alloc(100, 1);
    await UploadService.uploadChunk(userId, uploadId, 1, Readable.from([chunk]));
    const hash = createHash("sha256").update(chunk).digest("base64");

    const results = await Promise.allSettled([
      UploadService.completeFileUpload(userId, uploadId, null, hash),
      UploadService.completeFileUpload(userId, uploadId, null, hash),
    ]);

    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(results.find(({ status }) => status === "rejected")).toMatchObject({
      reason: { code: "NOT_FOUND" },
    });
    expect(await FileService.getAllFileIds(userId)).toHaveLength(1);
  });

  it("discards corrupted uploads", async () => {
    const { userId } = await createUser();
    const { uploadId } = await UploadService.startFileUpload({
      ...newEntryParams(userId, "root"),
      totalChunks: 1,
      hskVersion: null,
      contentType: "image/png",
      encCreatedAt: null,
      encLastModifiedAt: ciphertext(),
    });
    await UploadService.uploadChunk(userId, uploadId, 1, Readable.from([Buffer.alloc(100)]));

    await expect(
      UploadService.completeFileUpload(userId, uploadId, null, "invalid"),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await UploadRepo.getUploadSession(db, uploadId, userId)).toBeNull();
  });

  it("rejects chunks of invalid sizes", async () => {
    const { userId } = await createUser();
    const { uploadId } = await UploadService.startFileUpload({
      ...newEntryParams(userId, "root"),
      totalChunks: 2,
      hskVersion: null,
      contentType: "image/png",
      encCreatedAt: null,
      encLastModifiedAt: ciphertext(),
    });

    await expect(
      UploadService.uploadChunk(userId, uploadId, 1, Readable.from([Buffer.alloc(100)])),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
