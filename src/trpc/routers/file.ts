import { z } from "zod";
import { FileService } from "#lib/server/services/index.js";
import { toFileDto, toFileWithCategoriesDto } from "#trpc/dto.js";
import { router, roleProcedure } from "#trpc/init.server.js";
import { Base64Schema, EncryptedNameSchema, IdSchema, toCiphertext } from "#trpc/schemas.js";

const fileRouter = router({
  get: roleProcedure["activeClient"]
    .input(
      z.object({
        id: IdSchema,
      }),
    )
    .query(async ({ ctx, input }) => {
      return toFileWithCategoriesDto(await FileService.getFile(ctx.session.userId, input.id));
    }),

  bulkGet: roleProcedure["activeClient"]
    .input(
      z.object({
        ids: IdSchema.array(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const files = await FileService.getFiles(ctx.session.userId, input.ids);
      return files.map(toFileWithCategoriesDto);
    }),

  list: roleProcedure["activeClient"].query(async ({ ctx }) => {
    return await FileService.getAllFileIds(ctx.session.userId);
  }),

  listByHash: roleProcedure["activeClient"]
    .input(
      z.object({
        hskVersion: IdSchema,
        contentHmac: Base64Schema,
      }),
    )
    .query(async ({ ctx, input }) => {
      return await FileService.getFileIdsByContentHmac(
        ctx.session.userId,
        input.hskVersion,
        input.contentHmac,
      );
    }),

  listWithoutThumbnail: roleProcedure["activeClient"].query(async ({ ctx }) => {
    const files = await FileService.getFilesWithoutThumbnail(ctx.session.userId);
    return files.map(toFileDto);
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
      await FileService.renameFile(
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
      await FileService.deleteFile(ctx.session.userId, input.id);
    }),

  thumbnail: roleProcedure["activeClient"]
    .input(
      z.object({
        id: IdSchema,
      }),
    )
    .query(async ({ ctx, input }) => {
      const { updatedAt } = await FileService.getFileThumbnail(ctx.session.userId, input.id);
      return { updatedAt };
    }),
});

export default fileRouter;
