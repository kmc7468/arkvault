import { callPostApi } from "$lib/hooks";
import type { CategoryFileAddRequest } from "$lib/server/schemas";

export { requestCategoryCreation, requestFileRemovalFromCategory } from "$lib/services/category";
export { requestFileDownload } from "$lib/services/file";

export const requestFileAdditionToCategory = async (fileId: number, categoryId: number) => {
  const res = await callPostApi<CategoryFileAddRequest>(`/api/category/${categoryId}/file/add`, {
    file: fileId,
  });
  return res.ok;
};
