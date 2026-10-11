import { z } from "zod";
import { SearchService } from "#lib/server/services/index.js";
import { toDirectoryDto, toFileDto } from "#trpc/dto.js";
import { router, roleProcedure } from "#trpc/init.server.js";
import { DirectoryIdSchema, IdSchema } from "#trpc/schemas.js";

const searchRouter = router({
  search: roleProcedure["activeClient"]
    .input(
      z.object({
        ancestor: DirectoryIdSchema.default("root"),
        inFavorites: z.boolean().default(false),
        includeCategories: IdSchema.array().default([]),
        excludeCategories: IdSchema.array().default([]),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { directories, files } = await SearchService.search(ctx.session.userId, {
        ancestorId: input.ancestor,
        inFavorites: input.inFavorites,
        includeCategoryIds: input.includeCategories,
        excludeCategoryIds: input.excludeCategories,
      });
      return {
        directories: directories.map(toDirectoryDto),
        files: files.map(toFileDto),
      };
    }),
});

export default searchRouter;
