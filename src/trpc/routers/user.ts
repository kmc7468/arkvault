import { UserService } from "#lib/server/services/index.ts";
import { router, roleProcedure } from "#trpc/init.server.ts";

const userRouter = router({
  get: roleProcedure["any"].query(async ({ ctx }) => {
    const { email, nickname } = await UserService.getUser(ctx.session.userId);
    return { email, nickname };
  }),
});

export default userRouter;
