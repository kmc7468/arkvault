import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { ClientRepo, MekRepo, IntegrityError } from "$lib/server/db";
import { verifySignature } from "$lib/server/modules/crypto";
import { router, roleProcedure } from "../init.server";

const verifyClientEncMekSig = async (
  userId: number,
  clientId: number,
  version: number,
  encMek: string,
  encMekSig: string,
) => {
  const userClient = await ClientRepo.getUserClientWithDetails(userId, clientId);
  if (!userClient) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Invalid session id" });
  }

  const data = JSON.stringify({ version, key: encMek });
  return verifySignature(Buffer.from(data), encMekSig, userClient.sigPubKey);
};

const mekRouter = router({
  list: roleProcedure["activeClient"].query(async ({ ctx }) => {
    const clientMeks = await MekRepo.getAllValidClientMeks(
      ctx.session.userId,
      ctx.session.clientId,
    );
    return clientMeks.map(({ version, state, encMek, encMekSig }) => ({
      version,
      state,
      mek: encMek,
      mekSig: encMekSig,
    }));
  }),

  registerInitial: roleProcedure["pendingClient"]
    .input(
      z.object({
        mek: z.base64().nonempty(),
        mekSig: z.base64().nonempty(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { userId, clientId } = ctx.session;
      const { mek, mekSig } = input;
      if (!(await verifyClientEncMekSig(userId, clientId, 1, mek, mekSig))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid signature" });
      }

      try {
        await MekRepo.registerInitialMek(userId, clientId, mek, mekSig);
        await ClientRepo.setUserClientStateToActive(userId, clientId);
      } catch (e) {
        if (e instanceof IntegrityError && e.message === "MEK already registered") {
          throw new TRPCError({ code: "CONFLICT", message: "Initial MEK already registered" });
        }
        throw e;
      }
    }),
});

export default mekRouter;
