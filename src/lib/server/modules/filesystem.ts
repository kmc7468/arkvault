import { rm, unlink } from "fs/promises";

export const safeRecursiveRm = async (path: string | null | undefined) => {
  if (path) {
    await rm(path, { recursive: true }).catch(console.error);
  }
};

export const safeUnlink = async (path: string | null | undefined) => {
  if (path) {
    await unlink(path).catch(console.error);
  }
};
