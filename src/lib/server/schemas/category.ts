import { z } from "zod";

export const categoryIdSchema = z.union([z.literal("root"), z.number().int().positive()]);
