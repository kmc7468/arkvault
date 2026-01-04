import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { FileRepo, MediaRepo, IntegrityError } from "$lib/server/db";
import { safeUnlink } from "$lib/server/modules/filesystem";
import { router, roleProcedure } from "../init.server";

const fileRouter = router({
  get: roleProcedure["activeClient"]
    .input(
      z.object({
        id: z.int().positive(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const file = await FileRepo.getFile(ctx.session.userId, input.id);
      if (!file) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invalid file id" });
      }

      const categories = await FileRepo.getAllFileCategories(input.id);
      return {
        parent: file.parentId,
        mekVersion: file.mekVersion,
        dek: file.encDek,
        dekVersion: file.dekVersion,
        contentType: file.contentType,
        contentIv: file.encContentIv,
        name: file.encName.ciphertext,
        nameIv: file.encName.iv,
        createdAt: file.encCreatedAt?.ciphertext,
        createdAtIv: file.encCreatedAt?.iv,
        lastModifiedAt: file.encLastModifiedAt.ciphertext,
        lastModifiedAtIv: file.encLastModifiedAt.iv,
        categories: categories.map((category) => ({
          id: category.id,
          parent: category.parentId,
          mekVersion: category.mekVersion,
          dek: category.encDek,
          dekVersion: category.dekVersion,
          name: category.encName.ciphertext,
          nameIv: category.encName.iv,
        })),
      };
    }),

  bulkGet: roleProcedure["activeClient"]
    .input(
      z.object({
        ids: z.number().positive().array(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const files = await FileRepo.getFilesWithCategories(ctx.session.userId, input.ids);
      return files.map((file) => ({
        id: file.id,
        parent: file.parentId,
        mekVersion: file.mekVersion,
        dek: file.encDek,
        dekVersion: file.dekVersion,
        contentType: file.contentType,
        contentIv: file.encContentIv,
        name: file.encName.ciphertext,
        nameIv: file.encName.iv,
        createdAt: file.encCreatedAt?.ciphertext,
        createdAtIv: file.encCreatedAt?.iv,
        lastModifiedAt: file.encLastModifiedAt.ciphertext,
        lastModifiedAtIv: file.encLastModifiedAt.iv,
        categories: file.categories.map((category) => ({
          id: category.id,
          parent: category.parentId,
          mekVersion: category.mekVersion,
          dek: category.encDek,
          dekVersion: category.dekVersion,
          name: category.encName.ciphertext,
          nameIv: category.encName.iv,
        })),
      }));
    }),

  list: roleProcedure["activeClient"].query(async ({ ctx }) => {
    return await FileRepo.getAllFileIds(ctx.session.userId);
  }),

  listByHash: roleProcedure["activeClient"]
    .input(
      z.object({
        hskVersion: z.int().positive(),
        contentHmac: z.base64().nonempty(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return await FileRepo.getAllFileIdsByContentHmac(
        ctx.session.userId,
        input.hskVersion,
        input.contentHmac,
      );
    }),

  listWithoutThumbnail: roleProcedure["activeClient"].query(async ({ ctx }) => {
    return await MediaRepo.getMissingFileThumbnails(ctx.session.userId);
  }),

  rename: roleProcedure["activeClient"]
    .input(
      z.object({
        id: z.int().positive(),
        dekVersion: z.date(),
        name: z.base64().nonempty(),
        nameIv: z.base64().nonempty(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await FileRepo.setFileEncName(ctx.session.userId, input.id, input.dekVersion, {
          ciphertext: input.name,
          iv: input.nameIv,
        });
      } catch (e) {
        if (e instanceof IntegrityError) {
          if (e.message === "File not found") {
            throw new TRPCError({ code: "NOT_FOUND", message: "Invalid file id" });
          } else if (e.message === "Invalid DEK version") {
            throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
          }
        }
        throw e;
      }
    }),

  delete: roleProcedure["activeClient"]
    .input(
      z.object({
        id: z.int().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const { path, thumbnailPath } = await FileRepo.unregisterFile(ctx.session.userId, input.id);
        safeUnlink(path); // Intended
        safeUnlink(thumbnailPath); // Intended
      } catch (e) {
        if (e instanceof IntegrityError && e.message === "File not found") {
          throw new TRPCError({ code: "NOT_FOUND", message: "Invalid file id" });
        }
        throw e;
      }
    }),

  thumbnail: roleProcedure["activeClient"]
    .input(
      z.object({
        id: z.int().positive(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const thumbnail = await MediaRepo.getFileThumbnail(ctx.session.userId, input.id);
      if (!thumbnail) {
        throw new TRPCError({ code: "NOT_FOUND", message: "File or its thumbnail not found" });
      }

      return { updatedAt: thumbnail.updatedAt, contentIv: thumbnail.encContentIv };
    }),
});

export default fileRouter;
