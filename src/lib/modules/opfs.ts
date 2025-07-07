let rootHandle: FileSystemDirectoryHandle | null = null;

export const prepareOpfs = async () => {
  rootHandle = await navigator.storage.getDirectory();
};

const getFileHandle = async (path: string, create = true) => {
  if (!rootHandle) {
    throw new Error("OPFS not prepared");
  } else if (path[0] !== "/") {
    throw new Error("Path must be absolute");
  }

  const parts = path.split("/");
  if (parts.length <= 1) {
    throw new Error("Invalid path");
  }

  try {
    let directoryHandle = rootHandle;
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

export const readFile = async (path: string) => {
  const { fileHandle } = await getFileHandle(path, false);
  if (!fileHandle) return null;

  const file = await fileHandle.getFile();
  return await file.arrayBuffer();
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

export const deleteFile = async (path: string) => {
  const { parentHandle, filename } = await getFileHandle(path, false);
  if (!parentHandle) return;

  await parentHandle.removeEntry(filename);
};

const getDirectoryHandle = async (path: string) => {
  if (!rootHandle) {
    throw new Error("OPFS not prepared");
  } else if (path[0] !== "/") {
    throw new Error("Path must be absolute");
  }

  const parts = path.split("/");
  if (parts.length <= 1) {
    throw new Error("Invalid path");
  }

  try {
    let directoryHandle = rootHandle;
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
