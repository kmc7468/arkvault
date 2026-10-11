import mime from "mime";
import { z } from "zod";
import { UploadService } from "#lib/server/services/index.ts";
import { router, roleProcedure } from "#trpc/init.server.ts";
import {
  Base64Schema,
  DirectoryIdSchema,
  EncryptedNameSchema,
  IdSchema,
  toCiphertext,
} from "#trpc/schemas.ts";

const uploadRouter = router({
  startFileUpload: roleProcedure["activeClient"]
    .input(
      z.object({
        chunks: IdSchema,
        parent: DirectoryIdSchema,
        mekVersion: IdSchema,
        dek: Base64Schema,
        dekVersion: z.date(),
        hskVersion: IdSchema.optional(),
        contentType: z
          .string()
          .trim()
          .nonempty()
          .refine((value) => mime.getExtension(value) !== null),
        ...EncryptedNameSchema,
        createdAt: Base64Schema.optional(),
        createdAtIv: Base64Schema.optional(),
        lastModifiedAt: Base64Schema,
        lastModifiedAtIv: Base64Schema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return await UploadService.startFileUpload({
        userId: ctx.session.userId,
        totalChunks: input.chunks,
        parentId: input.parent,
        mekVersion: input.mekVersion,
        encDek: input.dek,
        dekVersion: input.dekVersion,
        hskVersion: input.hskVersion ?? null,
        contentType: input.contentType,
        encName: toCiphertext(input.name, input.nameIv),
        encCreatedAt:
          input.createdAt && input.createdAtIv
            ? toCiphertext(input.createdAt, input.createdAtIv)
            : null,
        encLastModifiedAt: toCiphertext(input.lastModifiedAt, input.lastModifiedAtIv),
      });
    }),

  completeFileUpload: roleProcedure["activeClient"]
    .input(
      z.object({
        uploadId: z.uuidv4(),
        contentHmac: Base64Schema.optional(),
        encContentHash: Base64Schema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { fileId } = await UploadService.completeFileUpload(
        ctx.session.userId,
        input.uploadId,
        input.contentHmac ?? null,
        input.encContentHash,
      );
      return { file: fileId };
    }),

  startFileThumbnailUpload: roleProcedure["activeClient"]
    .input(
      z.object({
        file: IdSchema,
        dekVersion: z.date(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return await UploadService.startFileThumbnailUpload(
        ctx.session.userId,
        input.file,
        input.dekVersion,
      );
    }),

  completeFileThumbnailUpload: roleProcedure["activeClient"]
    .input(
      z.object({
        uploadId: z.uuidv4(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await UploadService.completeFileThumbnailUpload(ctx.session.userId, input.uploadId);
    }),
});

export default uploadRouter;
