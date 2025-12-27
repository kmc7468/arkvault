import { TRPCError } from "@trpc/server";
import argon2 from "argon2";
import { z } from "zod";
import { ClientRepo, SessionRepo, UserRepo, IntegrityError } from "$lib/server/db";
import env from "$lib/server/loadenv";
import { cookieOptions } from "$lib/server/modules/auth";
import { generateChallenge, verifySignature, issueSessionId } from "$lib/server/modules/crypto";
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
    .mutation(async ({ ctx, input }) => {
      if (input.oldPassword === input.newPassword) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Same passwords" });
      } else if (input.newPassword.length < 8) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Too short password" });
      }

      const user = await UserRepo.getUser(ctx.session.userId);
      if (!user) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Invalid session id" });
      } else if (!(await argon2.verify(user.password, input.oldPassword))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Invalid password" });
      }

      await UserRepo.setUserPassword(ctx.session.userId, await argon2.hash(input.newPassword));
      await SessionRepo.deleteAllOtherSessions(ctx.session.userId, ctx.session.sessionId);
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
