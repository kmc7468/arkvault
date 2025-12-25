import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { HskRepo, IntegrityError } from "$lib/server/db";
import { router, roleProcedure } from "../init.server";

const hskRouter = router({
  list: roleProcedure["activeClient"].query(async ({ ctx }) => {
    const hsks = await HskRepo.getAllValidHsks(ctx.session.userId);
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
        mekVersion: z.number().int().positive(),
        hsk: z.string().base64().nonempty(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await HskRepo.registerInitialHsk(
          ctx.session.userId,
          ctx.session.clientId,
          input.mekVersion,
          input.hsk,
        );
      } catch (e) {
        if (e instanceof IntegrityError && e.message === "HSK already registered") {
          throw new TRPCError({ code: "CONFLICT", message: "Initial HSK already registered" });
        }
        throw e;
      }
    }),
});

export default hskRouter;
