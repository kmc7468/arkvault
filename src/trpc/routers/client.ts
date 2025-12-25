import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { ClientRepo, IntegrityError } from "$lib/server/db";
import { verifyPubKey, verifySignature, generateChallenge } from "$lib/server/modules/crypto";
import env from "$lib/server/loadenv";
import { router, roleProcedure } from "../init.server";

const createUserClientChallenge = async (
  ip: string,
  userId: number,
  clientId: number,
  encPubKey: string,
) => {
  const { answer, challenge } = await generateChallenge(32, encPubKey);
  const { id } = await ClientRepo.registerUserClientChallenge(
    userId,
    clientId,
    answer.toString("base64"),
    ip,
    new Date(Date.now() + env.challenge.userClientExp),
  );
  return { id, challenge: challenge.toString("base64") };
};

const clientRouter = router({
  register: roleProcedure["notClient"]
    .input(
      z.object({
        encPubKey: z.string().base64().nonempty(),
        sigPubKey: z.string().base64().nonempty(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { userId } = ctx.session;
      const { encPubKey, sigPubKey } = input;
      const client = await ClientRepo.getClientByPubKeys(encPubKey, sigPubKey);
      if (client) {
        try {
          await ClientRepo.createUserClient(userId, client.id);
          return await createUserClientChallenge(ctx.locals.ip, userId, client.id, encPubKey);
        } catch (e) {
          if (e instanceof IntegrityError && e.message === "User client already exists") {
            throw new TRPCError({ code: "CONFLICT", message: "Client already registered" });
          }
          throw e;
        }
      } else {
        if (encPubKey === sigPubKey) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Same public keys" });
        } else if (!verifyPubKey(encPubKey) || !verifyPubKey(sigPubKey)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid public key(s)" });
        }

        try {
          const { id: clientId } = await ClientRepo.createClient(encPubKey, sigPubKey, userId);
          return await createUserClientChallenge(ctx.locals.ip, userId, clientId, encPubKey);
        } catch (e) {
          if (e instanceof IntegrityError && e.message === "Public key(s) already registered") {
            throw new TRPCError({ code: "CONFLICT", message: "Public key(s) already used" });
          }
          throw e;
        }
      }
    }),

  verify: roleProcedure["notClient"]
    .input(
      z.object({
        id: z.number().int().positive(),
        answerSig: z.string().base64().nonempty(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const challenge = await ClientRepo.consumeUserClientChallenge(
        input.id,
        ctx.session.userId,
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
        throw new TRPCError({ code: "FORBIDDEN", message: "Invalid challenge answer signature" });
      }

      await ClientRepo.setUserClientStateToPending(ctx.session.userId, client.id);
    }),
});

export default clientRouter;
