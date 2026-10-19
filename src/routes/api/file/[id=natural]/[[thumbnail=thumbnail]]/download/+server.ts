import { authorize } from "#lib/server/auth.ts";
import { handleAppErrors } from "#lib/server/http.ts";
import { FileService } from "#lib/server/services/index.ts";
import { parseRangeHeader, getContentRangeHeader } from "#lib/shared/http.ts";
import type { RequestEvent, RequestHandler } from "./$types";

const downloadHandler = async ({ locals, params, request }: RequestEvent) => {
  const { userId } = await authorize(locals, "activeClient");
  const { id } = params;

  const getStream = params.thumbnail
    ? FileService.getFileThumbnailStream
    : FileService.getFileStream;
  const { encContentStream, range, isRangeRequest } = await getStream(
    userId,
    id,
    parseRangeHeader(request.headers.get("Range")),
  );
  return {
    stream: encContentStream,
    status: isRangeRequest ? 206 : 200,
    headers: {
      "Accept-Ranges": "bytes",
      "Content-Length": String(range.end - range.start + 1),
      "Content-Type": "application/octet-stream",
      ...(isRangeRequest ? getContentRangeHeader(range) : {}),
    },
  };
};

export const GET: RequestHandler = handleAppErrors(async (event) => {
  const { stream, ...init } = await downloadHandler(event);
  return new Response(stream as ReadableStream, init);
});

export const HEAD: RequestHandler = handleAppErrors(async (event) => {
  const { stream, ...init } = await downloadHandler(event);
  await stream.cancel();
  return new Response(null, init);
});
