import { createHash, randomUUID } from "crypto";
import { createReadStream } from "fs";
import { mkdir, open, unlink } from "fs/promises";
import { dirname } from "path";
import env from "#lib/server/config.ts";

const roots = {
  library: () => env.libraryPath,
  thumbnails: () => env.thumbnailsPath,
};

// Creates an empty file at a new path so that it can't be taken by others
export const reserveFile = async (kind: keyof typeof roots, userId: number) => {
  const path = `${roots[kind]()}/${userId}/${randomUUID()}`;
  await mkdir(dirname(path), { recursive: true });
  const file = await open(path, "wx", 0o600);
  await file.close();
  return path;
};

export const deleteFile = async (path: string) => {
  try {
    await unlink(path);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
      throw e;
    }
  }
};

export const hashFile = async (path: string) => {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
  }
  return hash.digest("base64");
};
