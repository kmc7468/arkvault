import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { UserRepo } from "$lib/server/db";
import { router, roleProcedure } from "../init.server";

const userRouter = router({
  info: roleProcedure.any.query(async ({ ctx }) => {
    const user = await UserRepo.getUser(ctx.session.userId);
    if (!user) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Invalid session id" });
    }

    return { email: user.email, nickname: user.nickname };
  }),

  changeNickname: roleProcedure.any
    .input(
      z.object({
        newNickname: z.string().trim().min(2).max(8),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await UserRepo.setUserNickname(ctx.session.userId, input.newNickname);
    }),
});

export default userRouter;
