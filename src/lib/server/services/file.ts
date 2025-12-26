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

export const getFileStream = async (userId: number, fileId: number) => {
  const file = await FileRepo.getFile(userId, fileId);
  if (!file) {
    error(404, "Invalid file id");
  }

  const { size } = await stat(file.path);
  return {
    encContentStream: Readable.toWeb(createReadStream(file.path)),
    encContentSize: size,
  };
};

export const getFileThumbnailStream = async (userId: number, fileId: number) => {
  const thumbnail = await MediaRepo.getFileThumbnail(userId, fileId);
  if (!thumbnail) {
    error(404, "File or its thumbnail not found");
  }

  const { size } = await stat(thumbnail.path);
  return {
    encContentStream: Readable.toWeb(createReadStream(thumbnail.path)),
    encContentSize: size,
  };
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
