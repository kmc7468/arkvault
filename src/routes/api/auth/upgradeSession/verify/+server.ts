import { error, text } from "@sveltejs/kit";
import { authorize } from "$lib/server/modules/auth";
import { sessionUpgradeVerifyRequest } from "$lib/server/schemas";
import { verifySessionUpgradeChallenge } from "$lib/server/services/auth";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ locals, request }) => {
  const { sessionId } = await authorize(locals, "notClient");

  const zodRes = sessionUpgradeVerifyRequest.safeParse(await request.json());
  if (!zodRes.success) error(400, "Invalid request body");
  const { id, answerSig } = zodRes.data;

  await verifySessionUpgradeChallenge(sessionId, locals.ip, id, answerSig);
  return text("Session upgraded", { headers: { "Content-Type": "text/plain" } });
};
