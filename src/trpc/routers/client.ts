import { z } from "zod";
import { ClientService } from "#lib/server/services/index.ts";
import { router, roleProcedure } from "#trpc/init.server.ts";
import { Base64Schema, IdSchema } from "#trpc/schemas.ts";

const clientRouter = router({
  register: roleProcedure["notClient"]
    .input(
      z.object({
        encPubKey: Base64Schema,
        sigPubKey: Base64Schema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return await ClientService.registerClient(
        ctx.session.userId,
        ctx.locals.ip,
        input.encPubKey,
        input.sigPubKey,
      );
    }),

  verify: roleProcedure["notClient"]
    .input(
      z.object({
        id: IdSchema,
        answerSig: Base64Schema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ClientService.verifyClient(
        ctx.session.userId,
        ctx.locals.ip,
        input.id,
        input.answerSig,
      );
    }),
});

export default clientRouter;
