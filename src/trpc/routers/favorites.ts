import { z } from "zod";
import { DirectoryService, FileService } from "#lib/server/services/index.js";
import { toDirectoryDto, toFileDto } from "#trpc/dto.js";
import { router, roleProcedure } from "#trpc/init.server.js";
import { IdSchema } from "#trpc/schemas.js";

const IdInputSchema = z.object({ id: IdSchema });

const favoritesRouter = router({
  get: roleProcedure["activeClient"].query(async ({ ctx }) => {
    const [directories, files] = await Promise.all([
      DirectoryService.getFavoriteDirectories(ctx.session.userId),
      FileService.getFavoriteFiles(ctx.session.userId),
    ]);
    return {
      directories: directories.map(toDirectoryDto),
      files: files.map(toFileDto),
    };
  }),

  addDirectory: roleProcedure["activeClient"]
    .input(IdInputSchema)
    .mutation(async ({ ctx, input }) => {
      await DirectoryService.setDirectoryFavorite(ctx.session.userId, input.id, true);
    }),

  removeDirectory: roleProcedure["activeClient"]
    .input(IdInputSchema)
    .mutation(async ({ ctx, input }) => {
      await DirectoryService.setDirectoryFavorite(ctx.session.userId, input.id, false);
    }),

  addFile: roleProcedure["activeClient"].input(IdInputSchema).mutation(async ({ ctx, input }) => {
    await FileService.setFileFavorite(ctx.session.userId, input.id, true);
  }),

  removeFile: roleProcedure["activeClient"]
    .input(IdInputSchema)
    .mutation(async ({ ctx, input }) => {
      await FileService.setFileFavorite(ctx.session.userId, input.id, false);
    }),
});

export default favoritesRouter;
