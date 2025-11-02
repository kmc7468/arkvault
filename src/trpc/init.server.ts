import type { RequestEvent } from "@sveltejs/kit";
import { initTRPC } from "@trpc/server";

export const createContext = (event: RequestEvent) => event;

const t = initTRPC.context<Awaited<ReturnType<typeof createContext>>>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
