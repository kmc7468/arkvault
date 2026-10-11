import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { router } from "./init.server.ts";
import {
  authRouter,
  categoryRouter,
  clientRouter,
  directoryRouter,
  favoritesRouter,
  fileRouter,
  hskRouter,
  mekRouter,
  searchRouter,
  uploadRouter,
  userRouter,
} from "./routers/index.ts";

export const appRouter = router({
  auth: authRouter,
  category: categoryRouter,
  client: clientRouter,
  directory: directoryRouter,
  favorites: favoritesRouter,
  file: fileRouter,
  hsk: hskRouter,
  mek: mekRouter,
  search: searchRouter,
  upload: uploadRouter,
  user: userRouter,
});

export type AppRouter = typeof appRouter;
export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;
