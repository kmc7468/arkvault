import { error } from "@sveltejs/kit";
import { getUserClientWithDetails } from "$lib/server/db/client";
import { verifySignature } from "$lib/server/modules/crypto";

export const verifyClientEncMekSig = async (
  userId: number,
  clientId: number,
  version: number,
  encMek: string,
  encMekSig: string,
) => {
  const userClient = await getUserClientWithDetails(userId, clientId);
  if (!userClient) {
    error(500, "Invalid session id");
  }

  const data = JSON.stringify({ version, key: encMek });
  return verifySignature(Buffer.from(data), encMekSig, userClient.sigPubKey);
};
