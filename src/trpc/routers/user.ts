import { TRPCError } from "@trpc/server";
import { UserRepo } from "$lib/server/db";
import { router, roleProcedure } from "../init.server";

const userRouter = router({
  get: roleProcedure["any"].query(async ({ ctx }) => {
    const user = await UserRepo.getUser(ctx.session.userId);
    if (!user) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Invalid session id" });
    }

    return { email: user.email, nickname: user.nickname };
  }),
});

export default userRouter;
