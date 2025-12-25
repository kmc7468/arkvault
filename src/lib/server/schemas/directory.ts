import { z } from "zod";

export const directoryIdSchema = z.union([z.literal("root"), z.int().positive()]);
