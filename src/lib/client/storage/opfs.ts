const getFileHandle = async (path: string, create = true) => {
  if (path[0] !== "/") {
    throw new Error("Path must be absolute");
  }

  const parts = path.split("/");
  if (parts.length <= 1) {
    throw new Error("Invalid path");
  }

  try {
    let directoryHandle = await navigator.storage.getDirectory();
    for (const part of parts.slice(0, -1)) {
      if (!part) continue;
      directoryHandle = await directoryHandle.getDirectoryHandle(part, { create });
    }

    const filename = parts[parts.length - 1]!;
    const fileHandle = await directoryHandle.getFileHandle(filename, { create });
    return { parentHandle: directoryHandle, filename, fileHandle };
  } catch (e) {
    if (e instanceof DOMException && e.name === "NotFoundError") {
      return {};
    }
    throw e;
  }
};

export const getFile = async (path: string) => {
  const { fileHandle } = await getFileHandle(path, false);
  if (!fileHandle) return null;

  return await fileHandle.getFile();
};

export const readFile = async (path: string) => {
  return (await getFile(path))?.arrayBuffer() ?? null;
};

export const writeFile = async (path: string, data: ArrayBuffer) => {
  const { fileHandle } = await getFileHandle(path);
  const writable = await fileHandle!.createWritable();

  try {
    await writable.write(data);
  } finally {
    await writable.close();
  }
};

// Changes are applied atomically when the stream is closed, and discarded if it is aborted
export const createWritable = async (path: string) => {
  const { fileHandle } = await getFileHandle(path);
  return await fileHandle!.createWritable();
};

export const deleteFile = async (path: string) => {
  const { parentHandle, filename } = await getFileHandle(path, false);
  if (!parentHandle) return;

  await parentHandle.removeEntry(filename);
};

const getDirectoryHandle = async (path: string) => {
  if (path[0] !== "/") {
    throw new Error("Path must be absolute");
  }

  const parts = path.split("/");
  if (parts.length <= 1) {
    throw new Error("Invalid path");
  }

  try {
    let directoryHandle = await navigator.storage.getDirectory();
    let parentHandle;
    for (const part of parts.slice(1)) {
      if (!part) continue;
      parentHandle = directoryHandle;
      directoryHandle = await directoryHandle.getDirectoryHandle(part);
    }
    return { directoryHandle, parentHandle };
  } catch (e) {
    if (e instanceof DOMException && e.name === "NotFoundError") {
      return {};
    }
    throw e;
  }
};

export const deleteDirectory = async (path: string) => {
  const { directoryHandle, parentHandle } = await getDirectoryHandle(path);
  if (!parentHandle) return;

  await parentHandle.removeEntry(directoryHandle.name, { recursive: true });
};

const listEntryNames = async (path: string, kind: FileSystemHandleKind) => {
  const { directoryHandle } = await getDirectoryHandle(path);
  if (!directoryHandle) return [];

  const names: string[] = [];
  for await (const handle of directoryHandle.values()) {
    if (handle.kind === kind) {
      names.push(handle.name);
    }
  }
  return names;
};

export const listFileNames = (path: string) => listEntryNames(path, "file");

export const listDirectoryNames = (path: string) => listEntryNames(path, "directory");

// Deletes the files (not directories) directly under the directory
export const deleteFilesInDirectory = async (path: string) => {
  const { directoryHandle } = await getDirectoryHandle(path);
  if (!directoryHandle) return;

  for (const name of await listFileNames(path)) {
    await directoryHandle.removeEntry(name);
  }
};

// Renames the file atomically
export const moveFile = async (path: string, newPath: string) => {
  const { fileHandle } = await getFileHandle(path, false);
  if (!fileHandle) {
    throw new Error("File not found");
  }

  let directoryHandle = await navigator.storage.getDirectory();
  const parts = newPath.split("/").filter((part) => part);
  for (const part of parts.slice(0, -1)) {
    directoryHandle = await directoryHandle.getDirectoryHandle(part, { create: true });
  }

  // Supported by Chromium for the origin private file system
  await (
    fileHandle as FileSystemFileHandle & {
      move(destination: FileSystemDirectoryHandle, name: string): Promise<void>;
    }
  ).move(directoryHandle, parts.at(-1)!);
};
