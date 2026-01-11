import { error } from "@sveltejs/kit";
import { z } from "zod";
import { parseRangeHeader, getContentRangeHeader } from "$lib/modules/http";
import { authorize } from "$lib/server/modules/auth";
import { getFileStream, getFileThumbnailStream } from "$lib/server/services/file";
import type { RequestHandler, RouteParams } from "./$types";

const downloadHandler = async (locals: App.Locals, params: RouteParams, request: Request) => {
  const { userId } = await authorize(locals, "activeClient");

  const zodRes = z
    .object({
      id: z.coerce.number().int().positive(),
    })
    .safeParse(params);
  if (!zodRes.success) error(400, "Invalid path parameters");
  const { id } = zodRes.data;

  const getStream = params.thumbnail ? getFileThumbnailStream : getFileStream;
  const { encContentStream, range } = await getStream(
    userId,
    id,
    parseRangeHeader(request.headers.get("Range")),
  );
  return {
    stream: encContentStream,
    status: range ? 206 : 200,
    headers: {
      "Accept-Ranges": "bytes",
      "Content-Length": String(range.end - range.start + 1),
      "Content-Type": "application/octet-stream",
      ...getContentRangeHeader(range),
    },
  };
};

export const GET: RequestHandler = async ({ locals, params, request }) => {
  const { stream, ...init } = await downloadHandler(locals, params, request);
  return new Response(stream as ReadableStream, init);
};

export const HEAD: RequestHandler = async ({ locals, params, request }) => {
  return new Response(null, await downloadHandler(locals, params, request));
};
