import { getContext, setContext } from "svelte";
import { encryptString } from "$lib/modules/crypto";
import type { SelectedCategory } from "$lib/components/molecules";
import { trpc } from "$trpc/client";

export { requestCategoryCreation, requestFileRemovalFromCategory } from "$lib/services/category";

export interface SelectedFile {
  id: number;
  name: string;
}

export const createContext = () => {
  const context = $state({
    selectedCategory: undefined as SelectedCategory | undefined,
  });
  return setContext("context", context);
};

export const useContext = () => {
  return getContext<ReturnType<typeof createContext>>("context");
};

export const requestCategoryRename = async (category: SelectedCategory, newName: string) => {
  if (!category.dataKey) {
    // TODO: Error Handling
    return false;
  }

  const newNameEncrypted = await encryptString(newName, category.dataKey.key);

  try {
    await trpc().category.rename.mutate({
      id: category.id,
      dekVersion: category.dataKey.version,
      name: newNameEncrypted.ciphertext,
      nameIv: newNameEncrypted.iv,
    });
    return true;
  } catch {
    // TODO: Error Handling
    return false;
  }
};

export const requestCategoryDeletion = async (category: SelectedCategory) => {
  try {
    await trpc().category.delete.mutate({ id: category.id });
    return true;
  } catch {
    // TODO: Error Handling
    return false;
  }
};
