import { TRPCError } from "@trpc/server";
import { createHash } from "crypto";
import { createReadStream, createWriteStream } from "fs";
import { mkdir, rm } from "fs/promises";
import mime from "mime";
import { dirname } from "path";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { FileRepo, MediaRepo, UploadRepo, IntegrityError } from "$lib/server/db";
import db from "$lib/server/db/kysely";
import env from "$lib/server/loadenv";
import { getChunkDirectoryPath, safeUnlink } from "$lib/server/modules/filesystem";
import { directoryIdSchema } from "$lib/server/schemas";
import { router, roleProcedure } from "../init.server";

const uploadLocks = new Set<string>();

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
        isLegacy: !!file.encContentIv,
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
        isLegacy: !!file.encContentIv,
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

      return { updatedAt: thumbnail.updatedAt };
    }),

  startUpload: roleProcedure["activeClient"]
    .input(
      z.object({
        chunks: z.int().positive(),
        parent: directoryIdSchema,
        mekVersion: z.int().positive(),
        dek: z.base64().nonempty(),
        dekVersion: z.date(),
        hskVersion: z.int().positive().optional(),
        contentType: z
          .string()
          .trim()
          .nonempty()
          .refine((value) => mime.getExtension(value) !== null),
        name: z.base64().nonempty(),
        nameIv: z.base64().nonempty(),
        createdAt: z.base64().nonempty().optional(),
        createdAtIv: z.base64().nonempty().optional(),
        lastModifiedAt: z.base64().nonempty(),
        lastModifiedAtIv: z.base64().nonempty(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
      const oneMinuteLater = new Date(Date.now() + 60 * 1000);
      if (input.dekVersion <= oneMinuteAgo || input.dekVersion >= oneMinuteLater) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid DEK version" });
      }

      try {
        const { id: sessionId } = await UploadRepo.createUploadSession({
          userId: ctx.session.userId,
          totalChunks: input.chunks,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
          parentId: input.parent,
          mekVersion: input.mekVersion,
          encDek: input.dek,
          dekVersion: input.dekVersion,
          hskVersion: input.hskVersion ?? null,
          contentType: input.contentType,
          encName: { ciphertext: input.name, iv: input.nameIv },
          encCreatedAt:
            input.createdAt && input.createdAtIv
              ? { ciphertext: input.createdAt, iv: input.createdAtIv }
              : null,
          encLastModifiedAt: { ciphertext: input.lastModifiedAt, iv: input.lastModifiedAtIv },
        });
        await mkdir(getChunkDirectoryPath(sessionId), { recursive: true });
        return { uploadId: sessionId };
      } catch (e) {
        if (e instanceof IntegrityError) {
          if (e.message === "Inactive MEK version") {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid MEK version" });
          } else if (e.message === "Inactive HSK version") {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid HSK version" });
          }
        }
        throw e;
      }
    }),

  completeUpload: roleProcedure["activeClient"]
    .input(
      z.object({
        uploadId: z.uuidv4(),
        contentHmac: z.base64().nonempty().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { uploadId } = input;
      if (uploadLocks.has(uploadId)) {
        throw new TRPCError({ code: "CONFLICT", message: "Upload already in progress" }); // TODO: Message
      } else {
        uploadLocks.add(uploadId);
      }

      const filePath = `${env.libraryPath}/${ctx.session.userId}/${uuidv4()}`;
      await mkdir(dirname(filePath), { recursive: true });

      try {
        const session = await UploadRepo.getUploadSession(uploadId, ctx.session.userId);
        if (!session) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Invalid upload id" });
        } else if (
          (session.hskVersion && !input.contentHmac) ||
          (!session.hskVersion && input.contentHmac)
        ) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid content hmac" }); // TODO: message
        } else if (session.uploadedChunks.length < session.totalChunks) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Upload not complete" }); // TODO: Message
        }

        const chunkDirectoryPath = getChunkDirectoryPath(uploadId);
        const hashStream = createHash("sha256");
        const writeStream = createWriteStream(filePath, { flags: "wx", mode: 0o600 });

        for (let i = 0; i < session.totalChunks; i++) {
          for await (const chunk of createReadStream(`${chunkDirectoryPath}/${i}`)) {
            hashStream.update(chunk);
            writeStream.write(chunk);
          }
        }

        await new Promise<void>((resolve, reject) => {
          writeStream.end((e: any) => (e ? reject(e) : resolve()));
        });

        const hash = hashStream.digest("base64");
        const fileId = await db.transaction().execute(async (trx) => {
          const { id: fileId } = await FileRepo.registerFile(trx, {
            ...session,
            userId: ctx.session.userId,
            path: filePath,
            contentHmac: input.contentHmac ?? null,
            encContentHash: hash,
            encContentIv: null,
          });
          await UploadRepo.deleteUploadSession(trx, uploadId);
          return fileId;
        });

        await rm(chunkDirectoryPath, { recursive: true }).catch((e) => console.error(e));
        return { file: fileId };
      } catch (e) {
        await safeUnlink(filePath);
        throw e;
      } finally {
        uploadLocks.delete(uploadId);
      }
    }),
});

export default fileRouter;
