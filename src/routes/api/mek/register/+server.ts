import { error, text } from "@sveltejs/kit";
import { z } from "zod";
import { authenticate } from "$lib/server/modules/auth";
import { registerNewActiveMek } from "$lib/server/services/mek";
import type { RequestHandler } from "@sveltejs/kit";

export const POST: RequestHandler = async ({ request, cookies }) => {
  const zodRes = z
    .object({
      meks: z.array(
        z.object({
          clientId: z.number(),
          mek: z.string().base64().nonempty(),
        }),
      ),
    })
    .safeParse(await request.json());
  if (!zodRes.success) error(400, "Invalid request body");

  const { userId, clientId } = authenticate(cookies);
  if (!clientId) {
    error(403, "Forbidden");
  }

  const { meks } = zodRes.data;
  await registerNewActiveMek(
    userId,
    clientId,
    meks.map(({ clientId, mek }) => ({
      clientId,
      encMek: mek.trim(),
    })),
  );
  return text("MEK registered", { headers: { "Content-Type": "text/plain" } });
};
