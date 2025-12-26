import { getAllFileInfos } from "$lib/indexedDB";

export const requestFreshFilesRetrieval = async (limit = 8) => {
  const files = await getAllFileInfos();
  files.sort(
    (a, b) =>
      (b.createdAt ?? b.lastModifiedAt).getTime() - (a.createdAt ?? a.lastModifiedAt).getTime(),
  );
  return files.slice(0, limit);
};
