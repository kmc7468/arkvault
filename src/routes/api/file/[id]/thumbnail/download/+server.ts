import { error } from "@sveltejs/kit";
import { z } from "zod";
import { authorize } from "$lib/server/modules/auth";
import { parseRangeHeader, getContentRangeHeader } from "$lib/modules/http";
import { getFileThumbnailStream } from "$lib/server/services/file";
import type { RequestHandler } from "./$types";

const downloadHandler = async (
  locals: App.Locals,
  params: Record<string, string>,
  request: Request,
) => {
  const { userId } = await authorize(locals, "activeClient");

  const zodRes = z
    .object({
      id: z.coerce.number().int().positive(),
    })
    .safeParse(params);
  if (!zodRes.success) error(400, "Invalid path parameters");
  const { id } = zodRes.data;

  const { encContentStream, range } = await getFileThumbnailStream(
    userId,
    id,
    parseRangeHeader(request.headers.get("Range")),
  );
  return {
    stream: encContentStream,
    headers: {
      "Accept-Ranges": "bytes",
      "Content-Length": (range.end - range.start + 1).toString(),
      "Content-Type": "application/octet-stream",
      ...getContentRangeHeader(range),
    },
    isRangeRequest: !!range,
  };
};

export const GET: RequestHandler = async ({ locals, params, request }) => {
  const { stream, headers, isRangeRequest } = await downloadHandler(locals, params, request);
  return new Response(stream as ReadableStream, { status: isRangeRequest ? 206 : 200, headers });
};

export const HEAD: RequestHandler = async ({ locals, params, request }) => {
  const { headers, isRangeRequest } = await downloadHandler(locals, params, request);
  return new Response(null, { status: isRangeRequest ? 206 : 200, headers });
};
