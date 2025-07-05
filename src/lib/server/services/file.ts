import { error } from "@sveltejs/kit";
import { createHash } from "crypto";
import { createReadStream, createWriteStream } from "fs";
import { mkdir, stat, unlink } from "fs/promises";
import { dirname } from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { v4 as uuidv4 } from "uuid";
import { IntegrityError } from "$lib/server/db/error";
import {
  registerFile,
  getAllFileIdsByContentHmac,
  getFile,
  setFileEncName,
  unregisterFile,
  getAllFileCategories,
  type NewFile,
} from "$lib/server/db/file";
import {
  updateFileThumbnail,
  getFileThumbnail,
  getMissingFileThumbnails,
} from "$lib/server/db/media";
import type { Ciphertext } from "$lib/server/db/schema";
import env from "$lib/server/loadenv";

export const getFileInformation = async (userId: number, fileId: number) => {
  const file = await getFile(userId, fileId);
  if (!file) {
    error(404, "Invalid file id");
  }

  const categories = await getAllFileCategories(fileId);
  return {
    parentId: file.parentId ?? ("root" as const),
    mekVersion: file.mekVersion,
    encDek: file.encDek,
    dekVersion: file.dekVersion,
    contentType: file.contentType,
    encContentIv: file.encContentIv,
    encName: file.encName,
    encCreatedAt: file.encCreatedAt,
    encLastModifiedAt: file.encLastModifiedAt,
    categories: categories.map(({ id }) => id),
  };
};

export const deleteFile = async (userId: number, fileId: number) => {
  try {
    const { path } = await unregisterFile(userId, fileId);
    unlink(path); // Intended
  } catch (e) {
    if (e instanceof IntegrityError && e.message === "File not found") {
      error(404, "Invalid file id");
    }
    throw e;
  }
};

export const getFileStream = async (userId: number, fileId: number) => {
  const file = await getFile(userId, fileId);
  if (!file) {
    error(404, "Invalid file id");
  }

  const { size } = await stat(file.path);
  return {
    encContentStream: Readable.toWeb(createReadStream(file.path)),
    encContentSize: size,
  };
};

export const renameFile = async (
  userId: number,
  fileId: number,
  dekVersion: Date,
  newEncName: Ciphertext,
) => {
  try {
    await setFileEncName(userId, fileId, dekVersion, newEncName);
  } catch (e) {
    if (e instanceof IntegrityError) {
      if (e.message === "File not found") {
        error(404, "Invalid file id");
      } else if (e.message === "Invalid DEK version") {
        error(400, "Invalid DEK version");
      }
    }
    throw e;
  }
};

export const getFileThumbnailInformation = async (userId: number, fileId: number) => {
  const thumbnail = await getFileThumbnail(userId, fileId);
  if (!thumbnail) {
    error(404, "File or its thumbnail not found");
  }

  return { updatedAt: thumbnail.updatedAt, encContentIv: thumbnail.encContentIv };
};

export const getFileThumbnailStream = async (userId: number, fileId: number) => {
  const thumbnail = await getFileThumbnail(userId, fileId);
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

    const oldPath = await updateFileThumbnail(userId, fileId, dekVersion, path, encContentIv);
    if (oldPath) {
      safeUnlink(oldPath); // Intended
    }
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

export const scanDuplicateFiles = async (
  userId: number,
  hskVersion: number,
  contentHmac: string,
) => {
  const fileIds = await getAllFileIdsByContentHmac(userId, hskVersion, contentHmac);
  return { files: fileIds };
};

export const scanMissingFileThumbnails = async (userId: number) => {
  const fileIds = await getMissingFileThumbnails(userId);
  return { files: fileIds };
};

const safeUnlink = async (path: string) => {
  await unlink(path).catch(console.error);
};

export const uploadFile = async (
  params: Omit<NewFile, "path" | "encContentHash">,
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

    const { id: fileId } = await registerFile({
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
