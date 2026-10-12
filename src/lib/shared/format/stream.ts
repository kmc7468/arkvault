import { decryptChunk } from "#lib/shared/crypto/index.ts";
import type { ByteRange } from "#lib/shared/http.ts";
import { CHUNK_SIZE, ENCRYPTED_CHUNK_SIZE } from "./chunk.ts";

// Accumulates stream pieces and takes them out in fixed sizes without copying them repeatedly
const createByteQueue = () => {
  let pieces: Uint8Array[] = [];
  let size = 0;

  return {
    get size() {
      return size;
    },
    push(piece: Uint8Array) {
      pieces.push(piece);
      size += piece.byteLength;
    },
    take(length: number) {
      const result = new Uint8Array(length);
      let offset = 0;
      while (offset < length) {
        const piece = pieces[0]!;
        const count = Math.min(piece.byteLength, length - offset);
        result.set(piece.subarray(0, count), offset);
        offset += count;
        if (count === piece.byteLength) {
          pieces.shift();
        } else {
          pieces[0] = piece.subarray(count);
        }
      }
      size -= length;
      if (size === 0) {
        pieces = [];
      }
      return result;
    },
  };
};

// Decrypts the encrypted chunks covering the plaintext `range` (as returned by
// `getEncryptedRange`) into the plaintext of the range. `onChunk` receives each decrypted chunk
// as a whole, along with its index in the file. Async callbacks are awaited to apply backpressure.
export const createDecryptionStream = ({
  range,
  firstChunkIndex = 0,
  chunkCount,
  dataKey,
  isLegacy,
  onChunk,
}: {
  range: ByteRange;
  firstChunkIndex?: number;
  chunkCount: number;
  dataKey: CryptoKey;
  isLegacy: boolean;
  onChunk?: (chunkIndex: number, chunk: Uint8Array) => void | Promise<void>;
}) => {
  const queue = createByteQueue();
  let chunkIndex = 0;

  const decryptNextChunk = async (
    controller: TransformStreamDefaultController<Uint8Array>,
    encryptedSize: number,
  ) => {
    const decrypted = new Uint8Array(await decryptChunk(queue.take(encryptedSize).buffer, dataKey));
    await onChunk?.(firstChunkIndex + chunkIndex, decrypted);

    const isFirst = chunkIndex === 0;
    const isLast = chunkIndex === chunkCount - 1;
    chunkIndex++;

    if (isLegacy) {
      controller.enqueue(decrypted.subarray(range.start, range.end + 1));
    } else {
      controller.enqueue(
        decrypted.subarray(
          isFirst ? range.start % CHUNK_SIZE : 0,
          isLast ? (range.end % CHUNK_SIZE) + 1 : decrypted.byteLength,
        ),
      );
    }
  };

  return new TransformStream<Uint8Array, Uint8Array>({
    async transform(piece, controller) {
      queue.push(piece);

      // The last chunk may be shorter, so it is decrypted when the stream ends
      while (!isLegacy && queue.size >= ENCRYPTED_CHUNK_SIZE && chunkIndex < chunkCount - 1) {
        await decryptNextChunk(controller, ENCRYPTED_CHUNK_SIZE);
      }
    },
    async flush(controller) {
      if (chunkIndex === chunkCount - 1 && queue.size > 0) {
        await decryptNextChunk(controller, queue.size);
      }
      if (chunkIndex !== chunkCount || queue.size > 0) {
        throw new Error("Unexpected size of the encrypted content");
      }
    },
  });
};
