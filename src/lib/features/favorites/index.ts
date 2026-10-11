import {
  getDirectoryInfo,
  getFileInfo,
  setDirectoryFavorite,
  setFileFavorite,
  type LocalDirectoryInfo,
  type SummarizedFileInfo,
} from "#lib/features/filesystem/index.js";
import { sortEntries } from "#lib/utils/index.js";
import { trpc } from "#trpc/client.js";

export type FavoriteEntry =
  | { type: "directory"; name: string; details: LocalDirectoryInfo }
  | { type: "file"; name: string; details: SummarizedFileInfo };

export const getFavoriteEntries = async () => {
  const favorites = await trpc.favorites.get.query();
  const [directories, files] = await Promise.all([
    Promise.all(
      favorites.directories.map((directory) =>
        getDirectoryInfo(directory.id, { serverResponse: { ...directory, isFavorite: true } }),
      ),
    ),
    Promise.all(
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

export const removeFavorite = async ({ type, details }: FavoriteEntry) => {
  if (type === "directory") {
    await setDirectoryFavorite(details, false);
  } else {
    await setFileFavorite(details, false);
  }
};
