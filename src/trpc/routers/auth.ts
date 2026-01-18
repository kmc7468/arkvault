import { TRPCError } from "@trpc/server";
import argon2 from "argon2";
import { z } from "zod";
import { ClientRepo, SessionRepo, UserRepo, IntegrityError } from "$lib/server/db";
import env from "$lib/server/loadenv";
import { cookieOptions } from "$lib/server/modules/auth";
import { generateChallenge, verifySignature, issueSessionId } from "$lib/server/modules/crypto";
import { demoLogger } from "$lib/server/modules/logger";
import { router, publicProcedure, roleProcedure } from "../init.server";

const authRouter = router({
  login: publicProcedure
    .input(
      z.object({
        email: z.email(),
        password: z.string().nonempty(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const user = await UserRepo.getUserByEmail(input.email);
      if (!user || !(await argon2.verify(user.password, input.password))) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });
      }

      const { sessionId, sessionIdSigned } = await issueSessionId(32, env.session.secret);
      await SessionRepo.createSession(user.id, sessionId, ctx.locals.ip, ctx.locals.userAgent);
      ctx.cookies.set("sessionId", sessionIdSigned, cookieOptions);

      if (input.email === "arkvault-demo@minchan.me") {
        demoLogger.log("demo:login", { ip: ctx.locals.ip, sessionId });
      }
    }),

  logout: roleProcedure["any"].mutation(async ({ ctx }) => {
    await SessionRepo.deleteSession(ctx.session.sessionId);
    ctx.cookies.delete("sessionId", cookieOptions);
  }),

  changePassword: roleProcedure["any"]
    .input(
      z.object({
        oldPassword: z.string().nonempty(),
        newPassword: z.string().nonempty(),
      }),
    )
    .mutation(() => {
      throw new TRPCError({ code: "NOT_IMPLEMENTED" });
    }),

  upgrade: roleProcedure["notClient"]
    .input(
      z.object({
        encPubKey: z.base64().nonempty(),
        sigPubKey: z.base64().nonempty(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const client = await ClientRepo.getClientByPubKeys(input.encPubKey, input.sigPubKey);
      const userClient = client
        ? await ClientRepo.getUserClient(ctx.session.userId, client.id)
        : undefined;
      if (!client) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid public key(s)" });
      } else if (!userClient || userClient.state === "challenging") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Unregistered client" });
      }

      const { answer, challenge } = await generateChallenge(32, input.encPubKey);
      const { id } = await SessionRepo.registerSessionUpgradeChallenge(
        ctx.session.sessionId,
        client.id,
        answer.toString("base64"),
        ctx.locals.ip,
        new Date(Date.now() + env.challenge.sessionUpgradeExp),
      );

      return { id, challenge: challenge.toString("base64") };
    }),

  verifyUpgrade: roleProcedure["notClient"]
    .input(
      z.object({
        id: z.int().positive(),
        answerSig: z.base64().nonempty(),
        force: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const challenge = await SessionRepo.consumeSessionUpgradeChallenge(
        input.id,
        ctx.session.sessionId,
        ctx.locals.ip,
      );
      if (!challenge) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Invalid challenge answer" });
      }

      const client = await ClientRepo.getClient(challenge.clientId);
      if (!client) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Invalid challenge answer" });
      } else if (
        !verifySignature(Buffer.from(challenge.answer, "base64"), input.answerSig, client.sigPubKey)
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Invalid challenge answer signature",
        });
      }

      try {
        await SessionRepo.upgradeSession(
          ctx.session.userId,
          ctx.session.sessionId,
          client.id,
          input.force,
        );
      } catch (e) {
        if (e instanceof IntegrityError) {
          if (e.message === "Session not found") {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Invalid challenge answer",
            });
          } else if (!input.force && e.message === "Session already exists") {
            throw new TRPCError({ code: "CONFLICT", message: "Already logged in" });
          }
        }
        throw e;
      }
    }),
});

export default authRouter;
