import { storeFileThumbnailCache } from "#lib/client/cache/index.js";
import { uploadFile as doUploadFile } from "#lib/client/transfer/index.js";
import { invalidateDirectory } from "./directory";

// Uploads the file and caches it with its thumbnail locally. Returns `false` if the upload is canceled.
export const uploadFile = async (
  file: File,
  parentId: DirectoryId,
  onDuplicate: () => Promise<boolean>,
) => {
  const res = await doUploadFile(file, parentId, onDuplicate);
  if (!res) return false;

  invalidateDirectory(parentId);
  if (res.thumbnailBuffer) {
    void storeFileThumbnailCache(res.fileId, res.thumbnailBuffer);
  }
  return true;
};
