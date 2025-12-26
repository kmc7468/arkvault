import { generateDataKey, wrapDataKey, encryptString } from "$lib/modules/crypto";
import type { MasterKey } from "$lib/stores";
import { trpc } from "$trpc/client";

export const requestCategoryCreation = async (
  name: string,
  parentId: "root" | number,
  masterKey: MasterKey,
) => {
  const { dataKey, dataKeyVersion } = await generateDataKey();
  const nameEncrypted = await encryptString(name, dataKey);

  try {
    await trpc().category.create.mutate({
      parent: parentId,
      mekVersion: masterKey.version,
      dek: await wrapDataKey(dataKey, masterKey.key),
      dekVersion: dataKeyVersion,
      name: nameEncrypted.ciphertext,
      nameIv: nameEncrypted.iv,
    });
    return true;
  } catch {
    // TODO: Error Handling
    return false;
  }
};

export const requestFileRemovalFromCategory = async (fileId: number, categoryId: number) => {

  try {
    await trpc().category.removeFile.mutate({ id: categoryId, file: fileId });
    return true;
  } catch {
    // TODO: Error Handling
    return false;
  }
};
