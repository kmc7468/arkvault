import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { FileRepo, IntegrityError } from "$lib/server/db";
import { safeUnlink } from "$lib/server/modules/filesystem";
import { directoryIdSchema } from "$lib/server/schemas";
import { router, roleProcedure } from "../init.server";

const directoryRouter = router({
  get: roleProcedure["activeClient"]
    .input(
      z.object({
        id: directoryIdSchema,
      }),
    )
    .query(async ({ ctx, input }) => {
      const directory =
        input.id !== "root" ? await FileRepo.getDirectory(ctx.session.userId, input.id) : undefined;
      if (directory === null) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invalid directory id" });
      }

      const [directories, files] = await Promise.all([
        FileRepo.getAllDirectoriesByParent(ctx.session.userId, input.id),
        FileRepo.getAllFilesByParent(ctx.session.userId, input.id),
      ]);
      return {
        metadata: directory && {
          parent: directory.parentId,
          mekVersion: directory.mekVersion,
          dek: directory.encDek,
          dekVersion: directory.dekVersion,
          name: directory.encName.ciphertext,
          nameIv: directory.encName.iv,
        },
        subDirectories: directories.map(({ id }) => id),
        files: files.map(({ id }) => id),
      };
    }),

  create: roleProcedure["activeClient"]
    .input(
      z.object({
        parent: directoryIdSchema,
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
        await FileRepo.registerDirectory({
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
        await FileRepo.setDirectoryEncName(ctx.session.userId, input.id, input.dekVersion, {
          ciphertext: input.name,
          iv: input.nameIv,
        });
      } catch (e) {
        if (e instanceof IntegrityError) {
          if (e.message === "Directory not found") {
            throw new TRPCError({ code: "NOT_FOUND", message: "Invalid directory id" });
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
        const files = await FileRepo.unregisterDirectory(ctx.session.userId, input.id);
        return {
          deletedFiles: files.map((file) => {
            safeUnlink(file.path); // Intended
            safeUnlink(file.thumbnailPath); // Intended
            return file.id;
          }),
        };
      } catch (e) {
        if (e instanceof IntegrityError && e.message === "Directory not found") {
          throw new TRPCError({ code: "NOT_FOUND", message: "Invalid directory id" });
        }
        throw e;
      }
    }),
});

export default directoryRouter;
