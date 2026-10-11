import { getFile } from "#lib/client/storage/opfs.js";
import { decryptChunk } from "#lib/shared/crypto/index.js";
import {
  CHUNK_SIZE,
  ENCRYPTED_CHUNK_SIZE,
  getDecryptedSize,
  getEncryptedRange,
} from "#lib/shared/format/index.js";
import {
  getContentRangeHeader,
  parseRangeHeader,
  resolveRange,
  type ByteRange,
  type RangeRequest,
} from "#lib/shared/http.js";
import { DECRYPTED_FILE_URL_PREFIX, type FileMetadata } from "#lib/shared/serviceWorker.js";
import { getFileMetadata } from "../modules/metadata";

const createResponse = (
  stream: ReadableStream<Uint8Array>,
  isRangeRequest: boolean,
  range: ByteRange,
  contentType?: string,
  downloadFilename?: string,
) => {
  const headers: Record<string, string> = {
    "Accept-Ranges": "bytes",
    "Content-Length": String(range.end - range.start + 1),
    ...(isRangeRequest ? getContentRangeHeader(range) : {}),
  };

  if (contentType) {
    headers["Content-Type"] = contentType;
  }

  if (downloadFilename) {
    headers["Content-Disposition"] =
      `attachment; filename*=UTF-8''${encodeURIComponent(downloadFilename)}`;
  }

  return new Response(stream, {
    status: isRangeRequest ? 206 : 200,
    headers,
  });
};

const createRangeNotSatisfiableResponse = (total: number) => {
  return new Response("Invalid range", {
    status: 416,
    headers: { "Content-Range": `bytes */${total}` },
  });
};

const streamFromOpfs = async (
  file: File,
  metadata?: FileMetadata,
  rangeRequest?: RangeRequest,
  downloadFilename?: string,
) => {
  const range = resolveRange(rangeRequest, file.size);
  if (!range) {
    return createRangeNotSatisfiableResponse(file.size);
  }

  return createResponse(
    file.slice(range.start, range.end + 1).stream(),
    !!rangeRequest,
    range,
    metadata?.contentType,
    downloadFilename,
  );
};

const streamFromServer = async (
  id: number,
  metadata: FileMetadata,
  rangeRequest?: RangeRequest,
  downloadFilename?: string,
) => {
  const totalSize = getDecryptedSize(metadata.encContentSize, metadata.isLegacy);
  const range = resolveRange(rangeRequest, totalSize);
  if (!range) {
    return createRangeNotSatisfiableResponse(totalSize);
  }

  const { start, end } = range;
  const encryptedRange = getEncryptedRange(start, end, metadata.encContentSize, metadata.isLegacy);
  const apiResponse = await fetch(`/api/file/${id}/download`, {
    headers: { Range: `bytes=${encryptedRange.start}-${encryptedRange.end}` },
  });
  if (apiResponse.status !== 206 || !apiResponse.body) {
    return new Response("Failed to fetch encrypted file", { status: 502 });
  }

  if (metadata.isLegacy) {
    const fileEncrypted = await apiResponse.arrayBuffer();
    const decrypted = await decryptChunk(fileEncrypted, metadata.dataKey);
    return createResponse(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(decrypted.slice(start, end + 1)));
          controller.close();
        },
      }),
      !!rangeRequest,
      range,
      metadata.contentType,
      downloadFilename,
    );
  }

  const totalChunks = encryptedRange.lastChunkIndex - encryptedRange.firstChunkIndex + 1;
  let currentChunkIndex = 0;
  let buffer = new Uint8Array(0);

  const decryptingStream = new TransformStream<Uint8Array, Uint8Array>({
    async transform(chunk, controller) {
      const newBuffer = new Uint8Array(buffer.length + chunk.length);
      newBuffer.set(buffer);
      newBuffer.set(chunk, buffer.length);
      buffer = newBuffer;

      while (buffer.length >= ENCRYPTED_CHUNK_SIZE && currentChunkIndex < totalChunks - 1) {
        const encryptedChunk = buffer.slice(0, ENCRYPTED_CHUNK_SIZE);
        buffer = buffer.slice(ENCRYPTED_CHUNK_SIZE);

        const decrypted = await decryptChunk(encryptedChunk.buffer, metadata.dataKey);
        const sliceStart = currentChunkIndex === 0 ? start % CHUNK_SIZE : 0;
        controller.enqueue(new Uint8Array(decrypted.slice(sliceStart)));
        currentChunkIndex++;
      }
    },
    async flush(controller) {
      if (buffer.length > 0) {
        const decrypted = await decryptChunk(buffer.buffer, metadata.dataKey);
        const sliceStart = currentChunkIndex === 0 ? start % CHUNK_SIZE : 0;
        const sliceEnd = (end % CHUNK_SIZE) + 1;
        controller.enqueue(new Uint8Array(decrypted.slice(sliceStart, sliceEnd)));
      }
    },
  });

  return createResponse(
    apiResponse.body.pipeThrough(decryptingStream),
    !!rangeRequest,
    range,
    metadata.contentType,
    downloadFilename,
  );
};

const decryptFileHandler = async (request: Request, clientId: string) => {
  const url = new URL(request.url);
  const fileId = parseInt(url.pathname.slice(DECRYPTED_FILE_URL_PREFIX.length), 10);
  if (isNaN(fileId)) {
    return new Response("Invalid file id", { status: 400 });
  }

  const downloadFilename = url.searchParams.get("download") ?? undefined;
  const metadata = await getFileMetadata(fileId, clientId);
  const range = parseRangeHeader(request.headers.get("Range"));
  const cache = await getFile(`/cache/${fileId}`);
  if (cache) {
    return streamFromOpfs(cache, metadata, range, downloadFilename);
  } else if (metadata) {
    return streamFromServer(fileId, metadata, range, downloadFilename);
  } else {
    return new Response("Decryption not prepared", { status: 400 });
  }
};

export default decryptFileHandler;
