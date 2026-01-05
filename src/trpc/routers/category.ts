import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { CategoryRepo, FileRepo, IntegrityError } from "$lib/server/db";
import { categoryIdSchema } from "$lib/server/schemas";
import { router, roleProcedure } from "../init.server";

const categoryRouter = router({
  get: roleProcedure["activeClient"]
    .input(
      z.object({
        id: categoryIdSchema,
        recurse: z.boolean().default(false),
      }),
    )
    .query(async ({ ctx, input }) => {
      const category =
        input.id !== "root"
          ? await CategoryRepo.getCategory(ctx.session.userId, input.id)
          : undefined;
      if (category === null) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invalid category id" });
      }

      const [categories, files] = await Promise.all([
        CategoryRepo.getAllCategoriesByParent(ctx.session.userId, input.id),
        input.id !== "root"
          ? FileRepo.getAllFilesByCategory(ctx.session.userId, input.id, input.recurse)
          : undefined,
      ]);
      return {
        metadata: category && {
          parent: category.parentId,
          mekVersion: category.mekVersion,
          dek: category.encDek,
          dekVersion: category.dekVersion,
          name: category.encName.ciphertext,
          nameIv: category.encName.iv,
        },
        subCategories: categories.map((category) => ({
          id: category.id,
          mekVersion: category.mekVersion,
          dek: category.encDek,
          dekVersion: category.dekVersion,
          name: category.encName.ciphertext,
          nameIv: category.encName.iv,
        })),
        files: files?.map((file) => ({
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
          isRecursive: file.isRecursive,
        })),
      };
    }),

  create: roleProcedure["activeClient"]
    .input(
      z.object({
        parent: categoryIdSchema,
        mekVersion: z.int().positive(),
        dek: z.base64().nonempty(),
        dekVersion: z.date(),
        name: z.base64().nonempty(),
        nameIv: z.base64().nonempty(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
      const oneMinuteLater = new Date(Date.now() + 60 * 1000);
      if (input.dekVersion <= oneMinuteAgo || input.dekVersion >= oneMinuteLater) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid DEK version" });
      }

      try {
        await CategoryRepo.registerCategory({
          parentId: input.parent,
          userId: ctx.session.userId,
          mekVersion: input.mekVersion,
          encDek: input.dek,
          dekVersion: input.dekVersion,
          encName: { ciphertext: input.name, iv: input.nameIv },
        });
      } catch (e) {
        if (e instanceof IntegrityError && e.message === "Inactive MEK version") {
          throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
        }
        throw e;
      }
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
        await CategoryRepo.setCategoryEncName(ctx.session.userId, input.id, input.dekVersion, {
          ciphertext: input.name,
          iv: input.nameIv,
        });
      } catch (e) {
        if (e instanceof IntegrityError) {
          if (e.message === "Category not found") {
            throw new TRPCError({ code: "NOT_FOUND", message: "Invalid category id" });
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
        await CategoryRepo.unregisterCategory(ctx.session.userId, input.id);
      } catch (e) {
        if (e instanceof IntegrityError && e.message === "Category not found") {
          throw new TRPCError({ code: "NOT_FOUND", message: "Invalid category id" });
        }
        throw e;
      }
    }),

  addFile: roleProcedure["activeClient"]
    .input(
      z.object({
        id: z.int().positive(),
        file: z.int().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [category, file] = await Promise.all([
        CategoryRepo.getCategory(ctx.session.userId, input.id),
        FileRepo.getFile(ctx.session.userId, input.file),
      ]);
      if (!category) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invalid category id" });
      } else if (!file) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invalid file id" });
      }

      try {
        await FileRepo.addFileToCategory(input.file, input.id);
      } catch (e) {
        if (e instanceof IntegrityError && e.message === "File already added to category") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "File already added" });
        }
        throw e;
      }
    }),

  removeFile: roleProcedure["activeClient"]
    .input(
      z.object({
        id: z.int().positive(),
        file: z.int().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [category, file] = await Promise.all([
        CategoryRepo.getCategory(ctx.session.userId, input.id),
        FileRepo.getFile(ctx.session.userId, input.file),
      ]);
      if (!category) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invalid category id" });
      } else if (!file) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invalid file id" });
      }

      try {
        await FileRepo.removeFileFromCategory(input.file, input.id);
      } catch (e) {
        if (e instanceof IntegrityError && e.message === "File not found in category") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "File not added" });
        }
        throw e;
      }
    }),
});

export default categoryRouter;
