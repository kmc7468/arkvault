import { mkdir, writeFile } from "fs/promises";
import { dirname, join } from "path";
import env from "#lib/server/config.ts";

let sequence = 0;

export const createStoredFile = async (content: string | Buffer = "content") => {
  const path = join(env.libraryPath, "test", `file${++sequence}`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
  return path;
};
