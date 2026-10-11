import {
  getDirectoryInfo,
  getFileInfo,
  type SummarizedFileInfo,
  type SubDirectoryInfo,
  type LocalDirectoryInfo,
} from "#lib/modules/filesystem/index.js";
import { HybridPromise, sortEntries } from "#lib/utils/index.js";
import { trpc } from "#trpc/client.js";
import type { RouterOutputs } from "#trpc/router.server.js";

export type FavoriteEntry =
  | { type: "directory"; name: string; details: SubDirectoryInfo }
  | { type: "file"; name: string; details: SummarizedFileInfo };

export const requestFavoriteEntries = async (favorites: RouterOutputs["favorites"]["get"]) => {
  const [directories, files] = await HybridPromise.all([
    HybridPromise.all(
      favorites.directories.map((directory) =>
        getDirectoryInfo(directory.id, {
          serverResponse: { ...directory, isFavorite: true },
        }),
      ),
    ),
    HybridPromise.all(
      favorites.files.map((file) =>
        getFileInfo(file.id, { serverResponse: { ...file, isFavorite: true } }),
      ),
    ),
  ]);
  return [
    ...sortEntries(
      directories.map((directory): FavoriteEntry => ({
        type: "directory",
        name: directory.name!,
        details: directory as LocalDirectoryInfo,
      })),
    ),
    ...sortEntries(
      files.map((file): FavoriteEntry => ({
        type: "file",
        name: file.name!,
        details: file as SummarizedFileInfo,
      })),
    ),
  ];
};

export const requestRemoveFavorite = async (type: "file" | "directory", id: number) => {
  try {
    if (type === "directory") {
      await trpc.favorites.removeDirectory.mutate({ id });
    } else {
      await trpc.favorites.removeFile.mutate({ id });
    }
    return true;
  } catch {
    // TODO: Error Handling
    return false;
  }
};
