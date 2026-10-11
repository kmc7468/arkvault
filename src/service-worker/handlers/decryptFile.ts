import { getFileCache, storeFileCache } from "#lib/client/cache/fileCache.js";
import {
  createDecryptionStream,
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
import { trackDownloadProgress } from "../modules/progress";

interface StreamRequest {
  fileId: number;
  clientId: string;
  rangeRequest?: RangeRequest;
  downloadFilename?: string;
}

const createResponse = (
  stream: ReadableStream<Uint8Array>,
  { rangeRequest, downloadFilename }: StreamRequest,
  range: ByteRange,
  contentType?: string,
) => {
  const headers: Record<string, string> = {
    "Accept-Ranges": "bytes",
    "Content-Length": String(range.end - range.start + 1),
    ...(rangeRequest ? getContentRangeHeader(range) : {}),
  };

  if (contentType) {
    headers["Content-Type"] = contentType;
  }

  if (downloadFilename) {
    headers["Content-Disposition"] =
      `attachment; filename*=UTF-8''${encodeURIComponent(downloadFilename)}`;
  }

  return new Response(stream, {
    status: rangeRequest ? 206 : 200,
    headers,
  });
};

const createRangeNotSatisfiableResponse = (total: number) => {
  return new Response("Invalid range", {
    status: 416,
    headers: { "Content-Range": `bytes */${total}` },
  });
};

const streamFromCache = (request: StreamRequest, cache: File, metadata?: FileMetadata) => {
  const range = resolveRange(request.rangeRequest, cache.size);
  if (!range) {
    return createRangeNotSatisfiableResponse(cache.size);
  }

  return createResponse(
    cache.slice(range.start, range.end + 1).stream(),
    request,
    range,
    metadata?.contentType,
  );
};

const streamFromServer = async (request: StreamRequest, metadata: FileMetadata) => {
  const { fileId, clientId, rangeRequest } = request;
  const totalSize = getDecryptedSize(metadata.encContentSize, metadata.isLegacy);
  const range = resolveRange(rangeRequest, totalSize);
  if (!range) {
    return createRangeNotSatisfiableResponse(totalSize);
  }

  const encryptedRange = getEncryptedRange(
    range.start,
    range.end,
    metadata.encContentSize,
    metadata.isLegacy,
  );
  const apiResponse = await fetch(`/api/file/${fileId}/download`, {
    headers: { Range: `bytes=${encryptedRange.start}-${encryptedRange.end}` },
  });
  if (apiResponse.status !== 206 || !apiResponse.body) {
    return new Response("Failed to fetch encrypted file", { status: 502 });
  }

  let stream = apiResponse.body.pipeThrough(
    createDecryptionStream({
      range,
      chunkCount: encryptedRange.lastChunkIndex - encryptedRange.firstChunkIndex + 1,
      dataKey: metadata.dataKey,
      isLegacy: metadata.isLegacy,
    }),
  );

  // Cache and report the progress only when the whole content is requested (i.e. not seeking)
  if (!rangeRequest) {
    const [responseStream, cacheStream] = stream.tee();
    storeFileCache(fileId, cacheStream).catch(console.error);
    stream = trackDownloadProgress(responseStream, fileId, totalSize, clientId);
  }

  return createResponse(stream, request, range, metadata.contentType);
};

const decryptFileHandler = async (request: Request, clientId: string) => {
  const url = new URL(request.url);
  const fileId = parseInt(url.pathname.slice(DECRYPTED_FILE_URL_PREFIX.length), 10);
  if (isNaN(fileId)) {
    return new Response("Invalid file id", { status: 400 });
  }

  const streamRequest: StreamRequest = {
    fileId,
    clientId,
    rangeRequest: parseRangeHeader(request.headers.get("Range")),
    downloadFilename: url.searchParams.get("download") ?? undefined,
  };
  const metadata = await getFileMetadata(fileId, clientId);
  const cache = await getFileCache(fileId);
  if (cache) {
    return streamFromCache(streamRequest, cache, metadata);
  } else if (metadata) {
    return streamFromServer(streamRequest, metadata);
  } else {
    return new Response("Decryption not prepared", { status: 400 });
  }
};

export default decryptFileHandler;
