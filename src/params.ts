import { defineParams } from "@sveltejs/kit/params";
import { z } from "zod";

export const params = defineParams({
  // Natural numbers starting from 1, such as the ids of files, directories, and categories
  natural: z
    .string()
    .regex(/^[1-9]\d*$/)
    .transform(Number)
    .pipe(z.int()),
  uuid: z.uuidv4(),
  thumbnail: z.literal("thumbnail"),
});
