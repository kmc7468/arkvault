import { z } from "zod";
import { KeyService } from "#lib/server/services/index.ts";
import { router, roleProcedure } from "#trpc/init.server.ts";
import { Base64Schema, IdSchema } from "#trpc/schemas.ts";

const hskRouter = router({
  list: roleProcedure["activeClient"].query(async ({ ctx }) => {
    const hsks = await KeyService.getHsks(ctx.session.userId);
    return hsks.map(({ version, state, mekVersion, encHsk }) => ({
      version,
      state,
      mekVersion,
      hsk: encHsk,
    }));
  }),

  registerInitial: roleProcedure["activeClient"]
    .input(
      z.object({
        mekVersion: IdSchema,
        hsk: Base64Schema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await KeyService.registerInitialHsk(
        ctx.session.userId,
        ctx.session.clientId,
        input.mekVersion,
        input.hsk,
      );
    }),
});

export default hskRouter;
