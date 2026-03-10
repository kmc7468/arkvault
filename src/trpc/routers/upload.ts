import { TRPCError } from "@trpc/server";
import { createHash } from "crypto";
import { createReadStream } from "fs";
import { mkdir, open } from "fs/promises";
import mime from "mime";
import { dirname } from "path";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { DirectoryIdSchema } from "$lib/schemas";
import { FileRepo, MediaRepo, UploadRepo, IntegrityError } from "$lib/server/db";
import db from "$lib/server/db/kysely";
import env from "$lib/server/loadenv";
import { safeUnlink } from "$lib/server/modules/filesystem";
import { router, roleProcedure } from "../init.server";

const UPLOADS_EXPIRES = 24 * 3600 * 1000; // 24 hours

const sessionLocks = new Set<string>();

const reserveUploadPath = async (path: string) => {
  await mkdir(dirname(path), { recursive: true });
  const file = await open(path, "wx", 0o600);
  await file.close();
};

const generateFileUploadSession = async (userId: number) => {
  const id = uuidv4();
  const path = `${env.libraryPath}/${userId}/${uuidv4()}`;
  await reserveUploadPath(path);
  return { id, path };
};

const generateThumbnailUploadSession = async (userId: number) => {
  const id = uuidv4();
  const path = `${env.thumbnailsPath}/${userId}/${id}`;
  await reserveUploadPath(path);
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

      const { id, path } = await generateFileUploadSession(ctx.session.userId);

      try {
        await UploadRepo.createFileUploadSession({
          id,
          userId: ctx.session.userId,
          path,
          totalChunks: input.chunks,
          expiresAt: new Date(Date.now() + UPLOADS_EXPIRES),
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
        await safeUnlink(path);

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

  completeFileUpload: roleProcedure["activeClient"]
    .input(
      z.object({
        uploadId: z.uuidv4(),
        contentHmac: z.base64().nonempty().optional(),
        encContentHash: z.base64().nonempty(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { uploadId } = input;
      if (sessionLocks.has(uploadId)) {
        throw new TRPCError({ code: "CONFLICT", message: "Completion already in progress" });
      } else {
        sessionLocks.add(uploadId);
      }

      try {
        const session = await UploadRepo.getUploadSession(uploadId, ctx.session.userId);
        if (session?.type !== "file") {
          throw new TRPCError({ code: "NOT_FOUND", message: "Invalid upload id" });
        } else if (
          (session.hskVersion && !input.contentHmac) ||
          (!session.hskVersion && input.contentHmac)
        ) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid content HMAC" });
        } else if (session.uploadedChunks < session.totalChunks) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Upload not completed" });
        }

        const hashStream = createHash("sha256");

        for await (const chunk of createReadStream(session.path)) {
          hashStream.update(chunk);
        }

        const hash = hashStream.digest("base64");
        if (hash !== input.encContentHash) {
          await UploadRepo.deleteUploadSession(db, uploadId);
          await safeUnlink(session.path);
          throw new TRPCError({ code: "CONFLICT", message: "Uploaded file corrupted" });
        }

        const fileId = await db.transaction().execute(async (trx) => {
          const { id: fileId } = await FileRepo.registerFile(trx, {
            ...session,
            userId: ctx.session.userId,
            path: session.path,
            contentHmac: input.contentHmac ?? null,
            encContentHash: hash,
            encContentIv: null,
          });
          await UploadRepo.deleteUploadSession(trx, uploadId);
          return fileId;
        });

        return { file: fileId };
      } finally {
        sessionLocks.delete(uploadId);
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
      const { id, path } = await generateThumbnailUploadSession(ctx.session.userId);

      try {
        await UploadRepo.createThumbnailUploadSession({
          id,
          type: "thumbnail",
          userId: ctx.session.userId,
          path,
          totalChunks: 1, // Up to 4 MiB
          expiresAt: new Date(Date.now() + UPLOADS_EXPIRES),
          fileId: input.file,
          dekVersion: input.dekVersion,
        });
        return { uploadId: id };
      } catch (e) {
        await safeUnlink(path);

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

      try {
        const session = await UploadRepo.getUploadSession(uploadId, ctx.session.userId);
        if (session?.type !== "thumbnail") {
          throw new TRPCError({ code: "NOT_FOUND", message: "Invalid upload id" });
        } else if (session.uploadedChunks < session.totalChunks) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Upload not completed" });
        }

        const oldThumbnailPath = await db.transaction().execute(async (trx) => {
          const oldPath = await MediaRepo.updateFileThumbnail(
            trx,
            ctx.session.userId,
            session.fileId,
            session.dekVersion,
            session.path,
            null,
          );
          await UploadRepo.deleteUploadSession(trx, uploadId);
          return oldPath;
        });
        await safeUnlink(oldThumbnailPath);
      } catch (e) {
        if (e instanceof IntegrityError && e.message === "Invalid DEK version") {
          // DEK rotated after this upload started
          throw new TRPCError({ code: "CONFLICT", message: e.message });
        }
        throw e;
      } finally {
        sessionLocks.delete(uploadId);
      }
    }),
});

export default uploadRouter;
