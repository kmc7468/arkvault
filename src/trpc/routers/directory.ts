import { z } from "zod";
import { DirectoryService } from "#lib/server/services/index.js";
import { toDirectoryDto, toFileDto } from "#trpc/dto.js";
import { router, roleProcedure } from "#trpc/init.server.js";
import {
  Base64Schema,
  DirectoryIdSchema,
  EncryptedNameSchema,
  IdSchema,
  toCiphertext,
} from "#trpc/schemas.js";

const directoryRouter = router({
  get: roleProcedure["activeClient"]
    .input(
      z.object({
        id: DirectoryIdSchema,
      }),
    )
    .query(async ({ ctx, input }) => {
      const { directory, subDirectories, files } = await DirectoryService.getDirectory(
        ctx.session.userId,
        input.id,
      );
      return {
        metadata: directory && toDirectoryDto(directory),
        subDirectories: subDirectories.map(toDirectoryDto),
        files: files.map(toFileDto),
      };
    }),

  create: roleProcedure["activeClient"]
    .input(
      z.object({
        parent: DirectoryIdSchema,
        mekVersion: IdSchema,
        dek: Base64Schema,
        dekVersion: z.date(),
        ...EncryptedNameSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await DirectoryService.createDirectory({
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
      await DirectoryService.renameDirectory(
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
      const { deletedFileIds } = await DirectoryService.deleteDirectory(
        ctx.session.userId,
        input.id,
      );
      return { deletedFiles: deletedFileIds };
    }),
});

export default directoryRouter;
