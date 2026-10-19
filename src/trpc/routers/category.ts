import { z } from "zod";
import { CategoryService } from "#lib/server/services/index.ts";
import { toCategoryDto, toFileDto } from "#trpc/dto.ts";
import { router, roleProcedure } from "#trpc/init.server.ts";
import {
  Base64Schema,
  CategoryIdSchema,
  EncryptedNameSchema,
  IdSchema,
  toCiphertext,
} from "#trpc/schemas.ts";

const categoryRouter = router({
  get: roleProcedure["activeClient"]
    .input(
      z.object({
        id: CategoryIdSchema,
        recurse: z.boolean().default(false),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { category, subCategories, files } = await CategoryService.getCategory(
        ctx.session.userId,
        input.id,
        input.recurse,
      );
      return {
        metadata: category && toCategoryDto(category),
        subCategories: subCategories.map(toCategoryDto),
        files: files?.map((file) => ({ ...toFileDto(file), isRecursive: file.isRecursive })),
      };
    }),

  create: roleProcedure["activeClient"]
    .input(
      z.object({
        parent: CategoryIdSchema,
        mekVersion: IdSchema,
        dek: Base64Schema,
        dekVersion: z.date(),
        ...EncryptedNameSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await CategoryService.createCategory({
        userId: ctx.session.userId,
        parentId: input.parent,
        mekVersion: input.mekVersion,
        encDek: input.dek,
        dekVersion: input.dekVersion,
        encName: toCiphertext(input.name, input.nameIv),
      });
    }),

  rename: roleProcedure["activeClient"]
    .input(
      z.object({
        id: IdSchema,
        dekVersion: z.date(),
        ...EncryptedNameSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await CategoryService.renameCategory(
        ctx.session.userId,
        input.id,
        input.dekVersion,
        toCiphertext(input.name, input.nameIv),
      );
    }),

  delete: roleProcedure["activeClient"]
    .input(
      z.object({
        id: IdSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await CategoryService.deleteCategory(ctx.session.userId, input.id);
    }),

  addFile: roleProcedure["activeClient"]
    .input(
      z.object({
        id: IdSchema,
        file: IdSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await CategoryService.addFileToCategory(ctx.session.userId, input.id, input.file);
    }),

  removeFile: roleProcedure["activeClient"]
    .input(
      z.object({
        id: IdSchema,
        file: IdSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await CategoryService.removeFileFromCategory(ctx.session.userId, input.id, input.file);
    }),
});

export default categoryRouter;
