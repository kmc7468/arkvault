import { error } from "@sveltejs/kit";
import { createHash } from "crypto";
import { createReadStream, createWriteStream } from "fs";
import { mkdir, stat } from "fs/promises";
import { dirname } from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { v4 as uuidv4 } from "uuid";
import { FileRepo, MediaRepo, IntegrityError } from "$lib/server/db";
import env from "$lib/server/loadenv";
import { safeUnlink } from "$lib/server/modules/filesystem";

const createEncContentStream = async (
  path: string,
  iv: Buffer,
  range?: { start?: number; end?: number },
) => {
  const { size: fileSize } = await stat(path);
  const ivSize = iv.byteLength;
  const totalSize = fileSize + ivSize;

  const start = range?.start ?? 0;
  const end = range?.end ?? totalSize - 1;
  if (start > end || start < 0 || end >= totalSize) {
    error(416, "Invalid range");
  }

  return {
    encContentStream: Readable.toWeb(
      Readable.from(
        (async function* () {
          if (start < ivSize) {
            yield iv.subarray(start, Math.min(end + 1, ivSize));
          }
          if (end >= ivSize) {
            yield* createReadStream(path, {
              start: Math.max(0, start - ivSize),
              end: end - ivSize,
            });
          }
        })(),
      ),
    ),
    range: { start, end, total: totalSize },
  };
};

export const getFileStream = async (
  userId: number,
  fileId: number,
  range?: { start?: number; end?: number },
) => {
  const file = await FileRepo.getFile(userId, fileId);
  if (!file) {
    error(404, "Invalid file id");
  }

  return createEncContentStream(file.path, Buffer.from(file.encContentIv, "base64"), range);
};

export const getFileThumbnailStream = async (
  userId: number,
  fileId: number,
  range?: { start?: number; end?: number },
) => {
  const thumbnail = await MediaRepo.getFileThumbnail(userId, fileId);
  if (!thumbnail) {
    error(404, "File or its thumbnail not found");
  }

  return createEncContentStream(
    thumbnail.path,
    Buffer.from(thumbnail.encContentIv, "base64"),
    range,
  );
};

export const uploadFileThumbnail = async (
  userId: number,
  fileId: number,
  dekVersion: Date,
  encContentIv: string,
  encContentStream: Readable,
) => {
  const path = `${env.thumbnailsPath}/${userId}/${uuidv4()}`;
  await mkdir(dirname(path), { recursive: true });

  try {
    await pipeline(encContentStream, createWriteStream(path, { flags: "wx", mode: 0o600 }));

    const oldPath = await MediaRepo.updateFileThumbnail(
      userId,
      fileId,
      dekVersion,
      path,
      encContentIv,
    );
    safeUnlink(oldPath); // Intended
  } catch (e) {
    await safeUnlink(path);

    if (e instanceof IntegrityError) {
      if (e.message === "File not found") {
        error(404, "File not found");
      } else if (e.message === "Invalid DEK version") {
        error(400, "Mismatched DEK version");
      }
    }
    throw e;
  }
};

export const uploadFile = async (
  params: Omit<FileRepo.NewFile, "path" | "encContentHash">,
  encContentStream: Readable,
  encContentHash: Promise<string>,
) => {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const oneMinuteLater = new Date(Date.now() + 60 * 1000);
  if (params.dekVersion <= oneDayAgo || params.dekVersion >= oneMinuteLater) {
    error(400, "Invalid DEK version");
  }

  const path = `${env.libraryPath}/${params.userId}/${uuidv4()}`;
  await mkdir(dirname(path), { recursive: true });

  try {
    const hashStream = createHash("sha256");
    const [, hash] = await Promise.all([
      pipeline(
        encContentStream,
        async function* (source) {
          for await (const chunk of source) {
            hashStream.update(chunk);
            yield chunk;
          }
        },
        createWriteStream(path, { flags: "wx", mode: 0o600 }),
      ),
      encContentHash,
    ]);
    if (hashStream.digest("base64") !== hash) {
      throw new Error("Invalid checksum");
    }

    const { id: fileId } = await FileRepo.registerFile({
      ...params,
      path,
      encContentHash: hash,
    });
    return { fileId };
  } catch (e) {
    await safeUnlink(path);

    if (e instanceof IntegrityError && e.message === "Inactive MEK version") {
      error(400, "Invalid MEK version");
    } else if (
      e instanceof Error &&
      (e.message === "Invalid request body" || e.message === "Invalid checksum")
    ) {
      error(400, "Invalid request body");
    }
    throw e;
  }
};
