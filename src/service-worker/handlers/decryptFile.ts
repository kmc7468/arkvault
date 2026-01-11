import { DECRYPTED_FILE_URL_PREFIX, CHUNK_SIZE, ENCRYPTED_CHUNK_SIZE } from "../modules/constants";
import { decryptChunk, getEncryptedRange, getDecryptedSize } from "../modules/crypto";
import { parseRangeHeader, getContentRangeHeader } from "../modules/http";
import { getFile } from "../modules/opfs";
import { fileMetadataStore } from "../stores";
import type { FileMetadata } from "../types";

const createResponse = (
  stream: ReadableStream<Uint8Array>,
  isRangeRequest: boolean,
  range: { start: number; end: number; total: number },
  contentType?: string,
) => {
  return new Response(stream, {
    status: isRangeRequest ? 206 : 200,
    headers: {
      "Accept-Ranges": "bytes",
      "Content-Length": String(range.end - range.start + 1),
      "Content-Type": contentType ?? "application/octet-stream",
      ...(isRangeRequest ? getContentRangeHeader(range) : {}),
    },
  });
};

const streamFromOpfs = async (
  file: File,
  metadata?: FileMetadata,
  range?: { start?: number; end?: number },
) => {
  const start = range?.start ?? 0;
  const end = range?.end ?? file.size - 1;
  if (start > end || start < 0 || end >= file.size) {
    return new Response("Invalid range", { status: 416 });
  }

  return createResponse(
    file.slice(start, end + 1).stream(),
    !!range,
    { start, end, total: file.size },
    metadata?.contentType,
  );
};

const streamFromServer = async (
  id: number,
  metadata: FileMetadata,
  range?: { start?: number; end?: number },
) => {
  const totalSize = getDecryptedSize(metadata.encContentSize, metadata.isLegacy);
  const start = range?.start ?? 0;
  const end =
    range?.end ??
    (range && !metadata.isLegacy ? Math.min(start + CHUNK_SIZE, totalSize) : totalSize) - 1;
  if (start > end || start < 0 || end >= totalSize) {
    return new Response("Invalid range", { status: 416 });
  }

  const encryptedRange = getEncryptedRange(start, end, metadata.encContentSize, metadata.isLegacy);
  const apiResponse = await fetch(`/api/file/${id}/download`, {
    headers: { Range: `bytes=${encryptedRange.start}-${encryptedRange.end}` },
  });
  if (apiResponse.status !== 206) {
    return new Response("Failed to fetch encrypted file", { status: 502 });
  }

  const fileEncrypted = await apiResponse.arrayBuffer();
  return createResponse(
    new ReadableStream<Uint8Array>({
      async start(controller) {
        if (metadata.isLegacy) {
          const decrypted = await decryptChunk(fileEncrypted, metadata.dataKey);
          controller.enqueue(new Uint8Array(decrypted.slice(start, end + 1)));
          controller.close();
          return;
        }

        const chunks = encryptedRange.lastChunkIndex - encryptedRange.firstChunkIndex + 1;

        for (let i = 0; i < chunks; i++) {
          const chunk = await decryptChunk(
            fileEncrypted.slice(i * ENCRYPTED_CHUNK_SIZE, (i + 1) * ENCRYPTED_CHUNK_SIZE),
            metadata.dataKey,
          );
          const sliceStart = i === 0 ? start % CHUNK_SIZE : 0;
          const sliceEnd = i === chunks - 1 ? (end % CHUNK_SIZE) + 1 : chunk.byteLength;
          controller.enqueue(new Uint8Array(chunk.slice(sliceStart, sliceEnd)));
        }

        controller.close();
      },
    }),
    !!range,
    { start, end, total: totalSize },
    metadata.contentType,
  );
};

const decryptFileHandler = async (request: Request) => {
  const url = new URL(request.url);
  const fileId = parseInt(url.pathname.slice(DECRYPTED_FILE_URL_PREFIX.length), 10);
  if (isNaN(fileId)) {
    throw new Response("Invalid file id", { status: 400 });
  }

  const metadata = fileMetadataStore.get(fileId);
  const range = parseRangeHeader(request.headers.get("Range"));
  const cache = await getFile(`/cache/${fileId}`);
  if (cache) {
    return streamFromOpfs(cache, metadata, range);
  } else if (metadata) {
    return streamFromServer(fileId, metadata, range);
  } else {
    return new Response("Decryption not prepared", { status: 400 });
  }
};

export default decryptFileHandler;
