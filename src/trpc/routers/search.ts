import { z } from "zod";
import { DirectoryIdSchema } from "$lib/schemas";
import { DirectoryRepo, FileRepo } from "$lib/server/db";
import { router, roleProcedure } from "../init.server";

const searchRouter = router({
  search: roleProcedure["activeClient"]
    .input(
      z.object({
        ancestor: DirectoryIdSchema.default("root"),
        inFavorites: z.boolean().default(false),
        includeCategories: z.number().positive().array().default([]),
        excludeCategories: z.number().positive().array().default([]),
      }),
    )
    .query(async ({ ctx, input }) => {
      const [directories, files] = await Promise.all([
        input.includeCategories.length === 0 && input.excludeCategories.length === 0
          ? DirectoryRepo.searchDirectories(ctx.session.userId, {
              parentId: input.ancestor,
              inFavorites: input.inFavorites,
            })
          : [],
        FileRepo.searchFiles(ctx.session.userId, {
          parentId: input.ancestor,
          inFavorites: input.inFavorites,
          includeCategoryIds: input.includeCategories,
          excludeCategoryIds: input.excludeCategories,
        }),
      ]);
      return {
        directories: directories.map((directory) => ({
          id: directory.id,
          parent: directory.parentId,
          mekVersion: directory.mekVersion,
          dek: directory.encDek,
          dekVersion: directory.dekVersion,
          name: directory.encName.ciphertext,
          nameIv: directory.encName.iv,
          isFavorite: directory.isFavorite,
        })),
        files: files.map((file) => ({
          id: file.id,
          parent: file.parentId,
          mekVersion: file.mekVersion,
          dek: file.encDek,
          dekVersion: file.dekVersion,
          contentType: file.contentType,
          name: file.encName.ciphertext,
          nameIv: file.encName.iv,
          createdAt: file.encCreatedAt?.ciphertext,
          createdAtIv: file.encCreatedAt?.iv,
          lastModifiedAt: file.encLastModifiedAt.ciphertext,
          lastModifiedAtIv: file.encLastModifiedAt.iv,
          isFavorite: file.isFavorite,
        })),
      };
    }),
});

export default searchRouter;
