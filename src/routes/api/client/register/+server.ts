import { error, json } from "@sveltejs/kit";
import { authorize } from "$lib/server/modules/auth";
import {
  clientRegisterRequest,
  clientRegisterResponse,
  type ClientRegisterResponse,
} from "$lib/server/schemas";
import { registerUserClient } from "$lib/server/services/client";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ locals, request }) => {
  const { userId } = await authorize(locals, "notClient");

  const zodRes = clientRegisterRequest.safeParse(await request.json());
  if (!zodRes.success) error(400, "Invalid request body");
  const { encPubKey, sigPubKey } = zodRes.data;

  const { id, challenge } = await registerUserClient(userId, locals.ip, encPubKey, sigPubKey);
  return json(clientRegisterResponse.parse({ id, challenge } satisfies ClientRegisterResponse));
};
