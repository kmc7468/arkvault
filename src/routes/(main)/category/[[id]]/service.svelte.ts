import { getContext, setContext } from "svelte";
import { encryptString } from "$lib/modules/crypto";
import type { SelectedCategory } from "$lib/components/molecules";
import { useTRPC } from "$trpc/client";

export { requestCategoryCreation, requestFileRemovalFromCategory } from "$lib/services/category";

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
  const trpc = useTRPC();
  const newNameEncrypted = await encryptString(newName, category.dataKey);

  try {
    await trpc.category.rename.mutate({
      id: category.id,
      dekVersion: category.dataKeyVersion,
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
  const trpc = useTRPC();

  try {
    await trpc.category.delete.mutate({ id: category.id });
    return true;
  } catch {
    // TODO: Error Handling
    return false;
  }
};
