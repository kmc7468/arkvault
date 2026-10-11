import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { Readable } from "stream";
import { AppError } from "#lib/server/errors.js";

export const createEncContentStream = async (
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
    throw new AppError("RANGE_NOT_SATISFIABLE", "Invalid range");
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
    isRangeRequest: !!range,
  };
};
