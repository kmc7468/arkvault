import { json } from "@sveltejs/kit";
import { authenticate } from "$lib/server/modules/auth";
import { getUserClientList } from "$lib/server/services/client";
import type { RequestHandler } from "@sveltejs/kit";

export const GET: RequestHandler = async ({ cookies }) => {
  const { userId } = authenticate(cookies);
  const { userClients } = await getUserClientList(userId);
  return json({ clients: userClients });
};