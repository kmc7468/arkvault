import {
  decryptDirectoryMetadata,
  decryptFileMetadata,
  getFileInfo,
  type SummarizedFileInfo,
  type SubDirectoryInfo,
} from "$lib/modules/filesystem";
import { HybridPromise, sortEntries } from "$lib/utils";
import { trpc } from "$trpc/client";
import type { RouterOutputs } from "$trpc/router.server";

export type FavoriteEntry =
  | { type: "directory"; name: string; details: SubDirectoryInfo }
  | { type: "file"; name: string; details: SummarizedFileInfo };

export const requestFavoriteEntries = async (
  favorites: RouterOutputs["favorites"]["get"],
  masterKey: CryptoKey,
): Promise<FavoriteEntry[]> => {
  const directories: FavoriteEntry[] = await Promise.all(
    favorites.directories.map(async (dir) => {
      const metadata = await decryptDirectoryMetadata(dir, masterKey);
      return {
        type: "directory" as const,
        name: metadata.name,
        details: {
          id: dir.id,
          parentId: dir.parent,
          isFavorite: true,
          dataKey: metadata.dataKey,
          name: metadata.name,
        } as SubDirectoryInfo,
      };
    }),
  );

  const fileResults = await Promise.all(
    favorites.files.map(async (file) => {
      const result = await HybridPromise.resolve(
        getFileInfo(file.id, masterKey, {
          async fetchFromServer(id, cachedInfo) {
            const metadata = await decryptFileMetadata(file, masterKey);
            return {
              categories: [],
              ...cachedInfo,
              id: id as number,
              exists: true,
              parentId: file.parent,
              contentType: file.contentType,
              isFavorite: true,
              ...metadata,
            };
          },
        }),
      );
      if (result?.exists) {
        return {
          type: "file" as const,
          name: result.name,
          details: result as SummarizedFileInfo,
        };
      }
      return null;
    }),
  );

  const files = fileResults.filter(
    (f): f is { type: "file"; name: string; details: SummarizedFileInfo } => f !== null,
  );

  return [...sortEntries(directories), ...sortEntries(files)];
};

export const requestRemoveFavorite = async (type: "file" | "directory", id: number) => {
  try {
    if (type === "directory") {
      await trpc().favorites.removeDirectory.mutate({ id });
    } else {
      await trpc().favorites.removeFile.mutate({ id });
    }
    return true;
  } catch {
    // TODO: Error Handling
    return false;
  }
};
