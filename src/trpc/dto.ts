import type { Category } from "#lib/server/db/repositories/category.js";
import type { Directory } from "#lib/server/db/repositories/directory.js";
import type { File } from "#lib/server/db/repositories/file.js";

// Shapes of filesystem entries exposed by the API

export const toDirectoryDto = (directory: Directory) => ({
  id: directory.id,
  parent: directory.parentId,
  mekVersion: directory.mekVersion,
  dek: directory.encDek,
  dekVersion: directory.dekVersion,
  name: directory.encName.ciphertext,
  nameIv: directory.encName.iv,
  isFavorite: directory.isFavorite,
});

export const toFileDto = (file: File) => ({
  id: file.id,
  isLegacy: !!file.encContentIv,
  parent: file.parentId,
  mekVersion: file.mekVersion,
  dek: file.encDek,
  dekVersion: file.dekVersion,
  contentType: file.contentType,
  name: file.encName.ciphertext,
  nameIv: file.encName.iv,
  createdAt: file.encCreatedAt?.ciphertext,
  createdAtIv: file.encCreatedAt?.iv,
  lastModifiedAt: file.encLastModifiedAt.ciphertext,
  lastModifiedAtIv: file.encLastModifiedAt.iv,
  isFavorite: file.isFavorite,
});

export const toCategoryDto = (category: Category) => ({
  id: category.id,
  parent: category.parentId,
  mekVersion: category.mekVersion,
  dek: category.encDek,
  dekVersion: category.dekVersion,
  name: category.encName.ciphertext,
  nameIv: category.encName.iv,
});

export const toFileWithCategoriesDto = (file: File & { categories: Category[] }) => ({
  ...toFileDto(file),
  categories: file.categories.map(toCategoryDto),
});
