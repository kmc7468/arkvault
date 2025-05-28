import { error, text } from "@sveltejs/kit";
import env from "$lib/server/loadenv";
import { registerRequest } from "$lib/server/schemas";
import { register } from "$lib/server/services/auth";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ locals, request, cookies }) => {
  const zodRes = registerRequest.safeParse(await request.json());
  if (!zodRes.success) error(400, "Invalid request body");
  const { email, nickname, password } = zodRes.data;

  const { sessionIdSigned } = await register(
    email,
    nickname,
    password,
    locals.ip,
    locals.userAgent,
  );
  cookies.set("sessionId", sessionIdSigned, {
    path: "/",
    maxAge: env.session.exp / 1000,
    secure: true,
    sameSite: "strict",
  });

  return text("Registered and logged in", { headers: { "Content-Type": "text/plain" } });
};
