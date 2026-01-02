export type DataKey = { key: CryptoKey; version: Date };
type AllUndefined<T> = { [K in keyof T]?: undefined };

interface LocalDirectoryInfo {
  id: number;
  parentId: DirectoryId;
  dataKey?: DataKey;
  name: string;
  subDirectories: SubDirectoryInfo[];
  files: SummarizedFileInfo[];
}

interface RootDirectoryInfo {
  id: "root";
  parentId?: undefined;
  dataKey?: undefined;
  name?: undefined;
  subDirectories: SubDirectoryInfo[];
  files: SummarizedFileInfo[];
}

export type DirectoryInfo = LocalDirectoryInfo | RootDirectoryInfo;
export type SubDirectoryInfo = Omit<LocalDirectoryInfo, "parentId" | "subDirectories" | "files">;
export type MaybeDirectoryInfo =
  | (DirectoryInfo & { exists: true })
  | ({ id: DirectoryId; exists: false } & AllUndefined<Omit<DirectoryInfo, "id">>);

export interface FileInfo {
  id: number;
  parentId: DirectoryId;
  dataKey?: DataKey;
  contentType: string;
  contentIv?: string;
  name: string;
  createdAt?: Date;
  lastModifiedAt: Date;
  categories: { id: number; name: string }[];
}

export type SummarizedFileInfo = Omit<FileInfo, "parentId" | "contentIv" | "categories">;
export type CategoryFileInfo = SummarizedFileInfo & { isRecursive: boolean };
export type MaybeFileInfo =
  | (FileInfo & { exists: true })
  | ({ id: number; exists: false } & AllUndefined<Omit<FileInfo, "id">>);

interface LocalCategoryInfo {
  id: number;
  dataKey?: DataKey;
  name: string;
  subCategories: SubCategoryInfo[];
  files: CategoryFileInfo[];
  isFileRecursive: boolean;
}

interface RootCategoryInfo {
  id: "root";
  dataKey?: undefined;
  name?: undefined;
  subCategories: SubCategoryInfo[];
  files?: undefined;
  isFileRecursive?: undefined;
}

export type CategoryInfo = LocalCategoryInfo | RootCategoryInfo;
export type SubCategoryInfo = Omit<
  LocalCategoryInfo,
  "subCategories" | "files" | "isFileRecursive"
>;
export type MaybeCategoryInfo =
  | (CategoryInfo & { exists: true })
  | ({ id: CategoryId; exists: false } & AllUndefined<Omit<CategoryInfo, "id">>);
