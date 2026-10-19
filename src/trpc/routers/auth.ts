import { z } from "zod";
import { cookieOptions } from "#lib/server/auth.ts";
import { AuthService } from "#lib/server/services/index.ts";
import { router, publicProcedure, roleProcedure } from "#trpc/init.server.ts";
import { Base64Schema, IdSchema } from "#trpc/schemas.ts";

const authRouter = router({
  login: publicProcedure
    .input(
      z.object({
        email: z.email(),
        password: z.string().nonempty(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { sessionIdSigned } = await AuthService.login(
        input.email,
        input.password,
        ctx.locals.ip,
        ctx.locals.userAgent,
      );
      ctx.cookies.set("sessionId", sessionIdSigned, cookieOptions);
    }),

  logout: roleProcedure["any"].mutation(async ({ ctx }) => {
    await AuthService.logout(ctx.session.sessionId);
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
      await AuthService.changePassword(
        ctx.session.userId,
        ctx.session.sessionId,
        input.oldPassword,
        input.newPassword,
      );
    }),

  upgrade: roleProcedure["notClient"]
    .input(
      z.object({
        encPubKey: Base64Schema,
        sigPubKey: Base64Schema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return await AuthService.requestSessionUpgrade(
        ctx.session.userId,
        ctx.session.sessionId,
        ctx.locals.ip,
        input.encPubKey,
        input.sigPubKey,
      );
    }),

  verifyUpgrade: roleProcedure["notClient"]
    .input(
      z.object({
        id: IdSchema,
        answerSig: Base64Schema,
        force: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await AuthService.verifySessionUpgrade(
        ctx.session.userId,
        ctx.session.sessionId,
        ctx.locals.ip,
        input.id,
        input.answerSig,
        input.force,
      );
    }),
});

export default authRouter;
