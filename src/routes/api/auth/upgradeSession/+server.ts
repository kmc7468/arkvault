import { error, json } from "@sveltejs/kit";
import { authorize } from "$lib/server/modules/auth";
import {
  sessionUpgradeRequest,
  sessionUpgradeResponse,
  type SessionUpgradeResponse,
} from "$lib/server/schemas";
import { createSessionUpgradeChallenge } from "$lib/server/services/auth";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ locals, request }) => {
  const { sessionId, userId } = await authorize(locals, "notClient");

  const zodRes = sessionUpgradeRequest.safeParse(await request.json());
  if (!zodRes.success) error(400, "Invalid request body");
  const { encPubKey, sigPubKey } = zodRes.data;

  const { id, challenge } = await createSessionUpgradeChallenge(
    sessionId,
    userId,
    locals.ip,
    encPubKey,
    sigPubKey,
  );
  return json(sessionUpgradeResponse.parse({ id, challenge } satisfies SessionUpgradeResponse));
};
