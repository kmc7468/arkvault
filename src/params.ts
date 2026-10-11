import { defineParams } from "@sveltejs/kit/params";

export const params = defineParams({
  // Positive integers such as the ids of files, directories, and categories
  int: (param) => {
    const value = Number(param);
    return /^[1-9]\d*$/.test(param) && Number.isSafeInteger(value) ? value : undefined;
  },
  thumbnail: (param) => (param === "thumbnail" ? param : undefined),
});
