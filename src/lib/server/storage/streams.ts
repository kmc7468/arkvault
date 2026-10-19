import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { Readable } from "stream";
import { AppError } from "#lib/server/errors.ts";
import { resolveRange, type RangeRequest } from "#lib/shared/http.ts";

export const createEncContentStream = async (
  path: string,
  iv?: Buffer,
  rangeRequest?: RangeRequest,
) => {
  const { size: fileSize } = await stat(path);
  const ivSize = iv?.byteLength ?? 0;

  const range = resolveRange(rangeRequest, fileSize + ivSize);
  if (!range) {
    throw new AppError("RANGE_NOT_SATISFIABLE", "Invalid range");
  }

  const { start, end } = range;
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
    range,
    isRangeRequest: !!rangeRequest,
  };
};
