import {
  getCachedChunkIndexes,
  readCachedChunk,
  storeCachedChunk,
  touchFileCache,
  type FileCacheLayout,
} from "#lib/client/cache/file-cache.ts";
import { getFileCacheIndexOf } from "#lib/client/storage/indexed-db/cache-index.ts";
import {
  CHUNK_SIZE,
  createDecryptionStream,
  getChunkCount,
  getDecryptedSize,
  getEncryptedRange,
} from "#lib/shared/format/index.ts";
import {
  getContentRangeHeader,
  parseRangeHeader,
  resolveRange,
  type ByteRange,
  type RangeRequest,
} from "#lib/shared/http.ts";
import { DECRYPTED_FILE_URL_PREFIX, type FileMetadata } from "#lib/shared/service-worker.ts";
import { getFileMetadata } from "../modules/metadata.ts";
import { trackDownloadProgress } from "../modules/progress.ts";

interface StreamRequest {
  fileId: number;
  clientId: string;
  rangeRequest?: RangeRequest;
  downloadFilename?: string;
}

// A run of consecutive chunks which are either all cached or all not cached
interface Segment {
  isCached: boolean;
  firstChunkIndex: number;
  lastChunkIndex: number;
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

const splitIntoSegments = (
  firstChunkIndex: number,
  lastChunkIndex: number,
  cached: Set<number>,
) => {
  const segments: Segment[] = [];
  for (let chunkIndex = firstChunkIndex; chunkIndex <= lastChunkIndex; chunkIndex++) {
    const isCached = cached.has(chunkIndex);
    const last = segments.at(-1);
    if (last?.isCached === isCached) {
      last.lastChunkIndex = chunkIndex;
    } else {
      segments.push({ isCached, firstChunkIndex: chunkIndex, lastChunkIndex: chunkIndex });
    }
  }
  return segments;
};

// Clips the range to the chunks of the segment
const getSegmentRange = (
  range: ByteRange,
  { firstChunkIndex, lastChunkIndex }: Segment,
  { chunkCount }: FileCacheLayout,
) => {
  if (chunkCount === 1) return range;
  return {
    start: Math.max(range.start, firstChunkIndex * CHUNK_SIZE),
    end: Math.min(range.end, (lastChunkIndex + 1) * CHUNK_SIZE - 1),
    total: range.total,
  };
};

async function* readCachedSegment(
  fileId: number,
  layout: FileCacheLayout,
  segment: Segment,
  range: ByteRange,
) {
  const { start, end } = getSegmentRange(range, segment, layout);
  for (
    let chunkIndex = segment.firstChunkIndex;
    chunkIndex <= segment.lastChunkIndex;
    chunkIndex++
  ) {
    const chunk = await readCachedChunk(fileId, chunkIndex);
    if (!chunk) {
      throw new Error("Cached chunk not found");
    }

    const chunkStart = chunkIndex * CHUNK_SIZE;
    yield* chunk
      .slice(Math.max(start - chunkStart, 0), Math.min(end - chunkStart + 1, chunk.size))
      .stream();
  }
}

const getEncContentSize = async (fileId: number, metadata: FileMetadata) => {
  if (metadata.encContentSize === undefined) {
    const res = await fetch(`/api/file/${fileId}/download`, { method: "HEAD" });
    const encContentSize = parseInt(res.headers.get("Content-Length") ?? "", 10);
    if (!res.ok || isNaN(encContentSize)) {
      throw new Error("Failed to get the file size");
    }
    metadata.encContentSize = encContentSize;
  }
  return metadata.encContentSize;
};

async function* fetchSegment(
  request: StreamRequest,
  metadata: FileMetadata,
  layout: FileCacheLayout,
  segment: Segment,
  range: ByteRange,
) {
  const segmentRange = getSegmentRange(range, segment, layout);
  const encryptedRange = getEncryptedRange(
    segmentRange.start,
    segmentRange.end,
    await getEncContentSize(request.fileId, metadata),
    metadata.isLegacy,
  );
  const res = await fetch(`/api/file/${request.fileId}/download`, {
    headers: { Range: `bytes=${encryptedRange.start}-${encryptedRange.end}` },
  });
  if (res.status !== 206 || !res.body) {
    throw new Error("Failed to fetch encrypted file");
  }

  yield* res.body.pipeThrough(
    createDecryptionStream({
      range: segmentRange,
      firstChunkIndex: segment.firstChunkIndex,
      chunkCount: segment.lastChunkIndex - segment.firstChunkIndex + 1,
      dataKey: metadata.dataKey,
      isLegacy: metadata.isLegacy,
      // Chunks are written atomically, so the worker being terminated doesn't corrupt the cache
      onChunk: (chunkIndex, chunk) => {
        storeCachedChunk(request.fileId, chunkIndex, chunk, layout).catch(console.error);
      },
    }),
  );
}

const toStream = (iterable: AsyncIterable<Uint8Array>) => {
  const iterator = iterable[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await iterator.next();
      if (done) {
        controller.close();
      } else {
        controller.enqueue(value);
      }
    },
    async cancel() {
      await iterator.return?.();
    },
  });
};

const streamDecryptedFile = async (request: StreamRequest, metadata?: FileMetadata) => {
  const { fileId, clientId, rangeRequest } = request;
  // Completely cached files can be served without the server or the metadata
  const cacheIndex = await getFileCacheIndexOf(fileId);
  let layout: FileCacheLayout;
  if (cacheIndex?.isComplete) {
    layout = { totalSize: cacheIndex.totalSize, chunkCount: cacheIndex.chunkCount };
  } else if (metadata) {
    try {
      const encContentSize = await getEncContentSize(fileId, metadata);
      const totalSize = getDecryptedSize(encContentSize, metadata.isLegacy);
      layout = { totalSize, chunkCount: metadata.isLegacy ? 1 : getChunkCount(totalSize) };
    } catch {
      return new Response("Failed to get the file size", { status: 502 });
    }
  } else {
    return new Response("Decryption not prepared", { status: 400 });
  }

  const { totalSize } = layout;
  const range = resolveRange(rangeRequest, totalSize);
  if (!range) {
    return createRangeNotSatisfiableResponse(totalSize);
  }

  // Legacy files consist of a single chunk
  const getChunkIndex = (offset: number) =>
    layout.chunkCount === 1 ? 0 : Math.floor(offset / CHUNK_SIZE);
  const segments = splitIntoSegments(
    getChunkIndex(range.start),
    getChunkIndex(range.end),
    await getCachedChunkIndexes(fileId),
  );
  if (!metadata && segments.some(({ isCached }) => !isCached)) {
    return new Response("Decryption not prepared", { status: 400 });
  } else if (segments.some(({ isCached }) => isCached)) {
    void touchFileCache(fileId);
  }

  // Segments are read lazily, so that nothing is fetched if the client stops reading (e.g. seeking)
  let stream = toStream(
    (async function* () {
      for (const segment of segments) {
        yield* segment.isCached
          ? readCachedSegment(fileId, layout, segment, range)
          : fetchSegment(request, metadata!, layout, segment, range);
      }
    })(),
  );

  // Report the progress only when the whole content is fetched (i.e. viewing or saving the file)
  if (!rangeRequest && segments.some(({ isCached }) => !isCached)) {
    stream = trackDownloadProgress(stream, fileId, totalSize, clientId);
  }

  return createResponse(stream, request, range, metadata?.contentType);
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
  return streamDecryptedFile(streamRequest, await getFileMetadata(fileId, clientId));
};

export default decryptFileHandler;
