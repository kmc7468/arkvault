import { z } from "zod";

export const DirectoryIdSchema = z.union([z.literal("root"), z.int().positive()]);
export const CategoryIdSchema = z.union([z.literal("root"), z.int().positive()]);
