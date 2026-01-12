import { error } from "@sveltejs/kit";
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { Readable } from "stream";
import { FileRepo, MediaRepo } from "$lib/server/db";

const createEncContentStream = async (
  path: string,
  iv?: Buffer,
  range?: { start?: number; end?: number },
) => {
  const { size: fileSize } = await stat(path);
  const ivSize = iv?.byteLength ?? 0;
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
            yield iv!.subarray(start, Math.min(end + 1, ivSize));
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

  return createEncContentStream(
    file.path,
    file.encContentIv ? Buffer.from(file.encContentIv, "base64") : undefined,
    range,
  );
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
    thumbnail.encContentIv ? Buffer.from(thumbnail.encContentIv, "base64") : undefined,
    range,
  );
};
