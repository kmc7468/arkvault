import { defineParams } from "@sveltejs/kit/params";

const matchThumbnail = (param: string) => {
  return param === "thumbnail";
};

export const params = defineParams({
  thumbnail: (param) => (matchThumbnail(param) ? param : undefined),
});
