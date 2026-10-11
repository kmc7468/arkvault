import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ url }) => {
  const redirectPath = url.searchParams.get("redirect") || "/home";
  return { redirectPath };
};
