import { TRPCError } from "@trpc/server";
import { createHash } from "crypto";
import { createReadStream, createWriteStream } from "fs";
import { mkdir, rename } from "fs/promises";
import mime from "mime";
import { dirname } from "path";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { DirectoryIdSchema } from "$lib/schemas";
import { FileRepo, MediaRepo, UploadRepo, IntegrityError } from "$lib/server/db";
import db from "$lib/server/db/kysely";
import env from "$lib/server/loadenv";
import { safeRecursiveRm, safeUnlink } from "$lib/server/modules/filesystem";
import { router, roleProcedure } from "../init.server";

const sessionLocks = new Set<string>();

const generateSessionId = async () => {
  const id = uuidv4();
  const path = `${env.uploadsPath}/${id}`;
  await mkdir(path, { recursive: true });
  return { id, path };
};

const uploadRouter = router({
  startFileUpload: roleProcedure["activeClient"]
    .input(
      z.object({
        chunks: z.int().positive(),
        parent: DirectoryIdSchema,
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

      const { id, path } = await generateSessionId();

      try {
        await UploadRepo.createFileUploadSession({
          id,
          userId: ctx.session.userId,
          path,
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
        return { uploadId: id };
      } catch (e) {
        await safeRecursiveRm(path);

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

  startFileThumbnailUpload: roleProcedure["activeClient"]
    .input(
      z.object({
        file: z.int().positive(),
        dekVersion: z.date(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, path } = await generateSessionId();

      try {
        await UploadRepo.createThumbnailUploadSession({
          id,
          userId: ctx.session.userId,
          path,
          totalChunks: 1, // Up to 4 MiB
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
          fileId: input.file,
          dekVersion: input.dekVersion,
        });
        return { uploadId: id };
      } catch (e) {
        await safeRecursiveRm(path);

        if (e instanceof IntegrityError) {
          if (e.message === "File not found") {
            throw new TRPCError({ code: "NOT_FOUND", message: "File not found" });
          } else if (e.message === "Invalid DEK version") {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Mismatched DEK version" });
          }
        }
        throw e;
      }
    }),

  completeFileUpload: roleProcedure["activeClient"]
    .input(
      z.object({
        uploadId: z.uuidv4(),
        contentHmac: z.base64().nonempty().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { uploadId } = input;
      if (sessionLocks.has(uploadId)) {
        throw new TRPCError({ code: "CONFLICT", message: "Completion already in progress" });
      } else {
        sessionLocks.add(uploadId);
      }

      let filePath = "";

      try {
        const session = await UploadRepo.getUploadSession(uploadId, ctx.session.userId);
        if (!session || session.type !== "file") {
          throw new TRPCError({ code: "NOT_FOUND", message: "Invalid upload id" });
        } else if (
          (session.hskVersion && !input.contentHmac) ||
          (!session.hskVersion && input.contentHmac)
        ) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid content HMAC" });
        } else if (session.uploadedChunks.length < session.totalChunks) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Upload not completed" });
        }

        filePath = `${env.libraryPath}/${ctx.session.userId}/${uuidv4()}`;
        await mkdir(dirname(filePath), { recursive: true });

        const hashStream = createHash("sha256");
        const writeStream = createWriteStream(filePath, { flags: "wx", mode: 0o600 });

        for (let i = 0; i < session.totalChunks; i++) {
          for await (const chunk of createReadStream(`${session.path}/${i}`)) {
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

        await safeRecursiveRm(session.path);
        return { file: fileId };
      } catch (e) {
        await safeUnlink(filePath);
        throw e;
      } finally {
        sessionLocks.delete(uploadId);
      }
    }),

  completeFileThumbnailUpload: roleProcedure["activeClient"]
    .input(
      z.object({
        uploadId: z.uuidv4(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { uploadId } = input;
      if (sessionLocks.has(uploadId)) {
        throw new TRPCError({ code: "CONFLICT", message: "Completion already in progress" });
      } else {
        sessionLocks.add(uploadId);
      }

      let thumbnailPath = "";

      try {
        const session = await UploadRepo.getUploadSession(uploadId, ctx.session.userId);
        if (!session || session.type !== "thumbnail") {
          throw new TRPCError({ code: "NOT_FOUND", message: "Invalid upload id" });
        } else if (session.uploadedChunks.length < session.totalChunks) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Upload not completed" });
        }

        thumbnailPath = `${env.thumbnailsPath}/${ctx.session.userId}/${uploadId}`;
        await mkdir(dirname(thumbnailPath), { recursive: true });
        await rename(`${session.path}/0`, thumbnailPath);

        const oldThumbnailPath = await db.transaction().execute(async (trx) => {
          const oldPath = await MediaRepo.updateFileThumbnail(
            trx,
            ctx.session.userId,
            session.fileId,
            session.dekVersion,
            thumbnailPath,
            null,
          );
          await UploadRepo.deleteUploadSession(trx, uploadId);
          return oldPath;
        });
        await Promise.all([safeUnlink(oldThumbnailPath), safeRecursiveRm(session.path)]);
      } catch (e) {
        await safeUnlink(thumbnailPath);
        if (e instanceof IntegrityError) {
          if (e.message === "File not found") {
            throw new TRPCError({ code: "NOT_FOUND", message: "File not found" });
          } else if (e.message === "Invalid DEK version") {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Mismatched DEK version" });
          }
        }
        throw e;
      } finally {
        sessionLocks.delete(uploadId);
      }
    }),
});

export default uploadRouter;
