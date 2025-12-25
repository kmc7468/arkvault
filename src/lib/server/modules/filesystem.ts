import { unlink } from "fs/promises";

export const safeUnlink = async (path: string | null | undefined) => {
  if (path) {
    await unlink(path).catch(console.error);
  }
};
