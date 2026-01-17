import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { FileRepo, IntegrityError } from "$lib/server/db";
import { router, roleProcedure } from "../init.server";

const favoritesRouter = router({
  get: roleProcedure["activeClient"].query(async ({ ctx }) => {
    const [files, directories] = await Promise.all([
      FileRepo.getAllFavoriteFiles(ctx.session.userId),
      FileRepo.getAllFavoriteDirectories(ctx.session.userId),
    ]);
    return {
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
      })),
      directories: directories.map((directory) => ({
        id: directory.id,
        parent: directory.parentId,
        mekVersion: directory.mekVersion,
        dek: directory.encDek,
        dekVersion: directory.dekVersion,
        name: directory.encName.ciphertext,
        nameIv: directory.encName.iv,
      })),
    };
  }),

  addFile: roleProcedure["activeClient"]
    .input(
      z.object({
        id: z.int().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await FileRepo.setFileFavorite(ctx.session.userId, input.id, true);
      } catch (e) {
        if (e instanceof IntegrityError) {
          if (e.message === "File not found") {
            throw new TRPCError({ code: "NOT_FOUND", message: "Invalid file id" });
          } else if (e.message === "File already favorited") {
            throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
          }
        }
        throw e;
      }
    }),

  removeFile: roleProcedure["activeClient"]
    .input(
      z.object({
        id: z.int().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await FileRepo.setFileFavorite(ctx.session.userId, input.id, false);
      } catch (e) {
        if (e instanceof IntegrityError) {
          if (e.message === "File not found") {
            throw new TRPCError({ code: "NOT_FOUND", message: "Invalid file id" });
          } else if (e.message === "File not favorited") {
            throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
          }
        }
        throw e;
      }
    }),

  addDirectory: roleProcedure["activeClient"]
    .input(
      z.object({
        id: z.int().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await FileRepo.setDirectoryFavorite(ctx.session.userId, input.id, true);
      } catch (e) {
        if (e instanceof IntegrityError) {
          if (e.message === "Directory not found") {
            throw new TRPCError({ code: "NOT_FOUND", message: "Invalid directory id" });
          } else if (e.message === "Directory already favorited") {
            throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
          }
        }
        throw e;
      }
    }),

  removeDirectory: roleProcedure["activeClient"]
    .input(
      z.object({
        id: z.int().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await FileRepo.setDirectoryFavorite(ctx.session.userId, input.id, false);
      } catch (e) {
        if (e instanceof IntegrityError) {
          if (e.message === "Directory not found") {
            throw new TRPCError({ code: "NOT_FOUND", message: "Invalid directory id" });
          } else if (e.message === "Directory not favorited") {
            throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
          }
        }
        throw e;
      }
    }),
});

export default favoritesRouter;
