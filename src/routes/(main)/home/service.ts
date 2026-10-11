import { getAllFileInfos } from "#lib/client/storage/indexedDB/index.js";

export const requestFreshMediaFilesRetrieval = async (limit = 8) => {
  const files = await getAllFileInfos();
  files.sort(
    (a, b) =>
      (b.createdAt ?? b.lastModifiedAt).getTime() - (a.createdAt ?? a.lastModifiedAt).getTime(),
  );
  return files
    .filter(
      ({ contentType }) => contentType.startsWith("image/") || contentType.startsWith("video/"),
    )
    .slice(0, limit);
};
