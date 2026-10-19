import { z } from "zod";
import { KeyService } from "#lib/server/services/index.ts";
import { router, roleProcedure } from "#trpc/init.server.ts";
import { Base64Schema } from "#trpc/schemas.ts";

const mekRouter = router({
  list: roleProcedure["activeClient"].query(async ({ ctx }) => {
    const clientMeks = await KeyService.getClientMeks(ctx.session.userId, ctx.session.clientId);
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
        mek: Base64Schema,
        mekSig: Base64Schema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await KeyService.registerInitialMek(
        ctx.session.userId,
        ctx.session.clientId,
        input.mek,
        input.mekSig,
      );
    }),
});

export default mekRouter;
