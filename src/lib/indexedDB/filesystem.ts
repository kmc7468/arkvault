import { Dexie, type EntityTable } from "dexie";

interface DirectoryInfo {
  id: number;
  parentId: DirectoryId;
  name: string;
}

interface FileInfo {
  id: number;
  parentId: DirectoryId;
  name: string;
  contentType: string;
  createdAt?: Date;
  lastModifiedAt: Date;
  categoryIds: number[];
}

interface CategoryInfo {
  id: number;
  parentId: CategoryId;
  name: string;
  files: { id: number; isRecursive: boolean }[];
  isFileRecursive: boolean;
}

const filesystem = new Dexie("filesystem") as Dexie & {
  directory: EntityTable<DirectoryInfo, "id">;
  file: EntityTable<FileInfo, "id">;
  category: EntityTable<CategoryInfo, "id">;
};

filesystem
  .version(3)
  .stores({
    directory: "id, parentId",
    file: "id, parentId",
    category: "id, parentId",
  })
  .upgrade(async (trx) => {
    await trx
      .table("category")
      .toCollection()
      .modify((category) => {
        category.isFileRecursive = false;
      });
  });

export const getDirectoryInfos = async (parentId: DirectoryId) => {
  return await filesystem.directory.where({ parentId }).toArray();
};

export const getDirectoryInfo = async (id: number) => {
  return await filesystem.directory.get(id);
};

export const storeDirectoryInfo = async (directoryInfo: DirectoryInfo) => {
  await filesystem.directory.put(directoryInfo);
};

export const deleteDirectoryInfo = async (id: number) => {
  await filesystem.directory.delete(id);
};

export const getAllFileInfos = async () => {
  return await filesystem.file.toArray();
};

export const getFileInfos = async (parentId: DirectoryId) => {
  return await filesystem.file.where({ parentId }).toArray();
};

export const getFileInfo = async (id: number) => {
  return await filesystem.file.get(id);
};

export const bulkGetFileInfos = async (ids: number[]) => {
  return await filesystem.file.bulkGet(ids);
};

export const storeFileInfo = async (fileInfo: FileInfo) => {
  await filesystem.file.put(fileInfo);
};

export const deleteFileInfo = async (id: number) => {
  await filesystem.file.delete(id);
};

export const getCategoryInfos = async (parentId: CategoryId) => {
  return await filesystem.category.where({ parentId }).toArray();
};

export const getCategoryInfo = async (id: number) => {
  return await filesystem.category.get(id);
};

export const storeCategoryInfo = async (categoryInfo: CategoryInfo) => {
  await filesystem.category.put(categoryInfo);
};

export const updateCategoryInfo = async (id: number, changes: { isFileRecursive?: boolean }) => {
  await filesystem.category.update(id, changes);
};

export const deleteCategoryInfo = async (id: number) => {
  await filesystem.category.delete(id);
};

export const cleanupDanglingInfos = async () => {
  const validDirectoryIds: number[] = [];
  const validFileIds: number[] = [];
  const directoryQueue: DirectoryId[] = ["root"];

  while (true) {
    const directoryId = directoryQueue.shift();
    if (!directoryId) break;

    const [subDirectories, files] = await Promise.all([
      filesystem.directory.where({ parentId: directoryId }).toArray(),
      filesystem.file.where({ parentId: directoryId }).toArray(),
    ]);
    subDirectories.forEach(({ id }) => {
      validDirectoryIds.push(id);
      directoryQueue.push(id);
    });
    files.forEach(({ id }) => validFileIds.push(id));
  }

  const validCategoryIds: number[] = [];
  const categoryQueue: CategoryId[] = ["root"];

  while (true) {
    const categoryId = categoryQueue.shift();
    if (!categoryId) break;

    const subCategories = await filesystem.category.where({ parentId: categoryId }).toArray();
    subCategories.forEach(({ id }) => {
      validCategoryIds.push(id);
      categoryQueue.push(id);
    });
  }

  await Promise.all([
    filesystem.directory.where("id").noneOf(validDirectoryIds).delete(),
    filesystem.file.where("id").noneOf(validFileIds).delete(),
    filesystem.category.where("id").noneOf(validCategoryIds).delete(),
  ]);
};
