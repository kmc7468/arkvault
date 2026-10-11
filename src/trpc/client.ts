import { createTRPCClient, httpBatchLink, TRPCClientError, type TRPCLink } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import superjson from "superjson";
import { goto } from "$app/navigation";
import { navigating } from "$app/state";
import type { AppRouter } from "./router.server.ts";

// Procedures that report invalid credentials as UNAUTHORIZED, not an expired session
const CREDENTIAL_PROCEDURES = new Set(["auth.login", "auth.upgrade"]);

const sessionExpiryLink: TRPCLink<AppRouter> = () => {
  return ({ op, next }) =>
    observable((observer) =>
      next(op).subscribe({
        next: (value) => observer.next(value),
        error: (err) => {
          // Prefer the destination when the request failed during a navigation's load
          const url = navigating.to?.url ?? location;
          if (
            err.data?.code === "UNAUTHORIZED" &&
            !CREDENTIAL_PROCEDURES.has(op.path) &&
            url.pathname !== "/auth/login"
          ) {
            void goto(`/auth/login?redirect=${encodeURIComponent(url.pathname + url.search)}`);
          }
          observer.error(err);
        },
        complete: () => observer.complete(),
      }),
    );
};

export const trpc = createTRPCClient<AppRouter>({
  links: [
    sessionExpiryLink,
    httpBatchLink({
      url: "/api/trpc",
      maxURLLength: 4096,
      methodOverride: "POST",
      transformer: superjson,
    }),
  ],
});

export const isTRPCClientError = (e: unknown): e is TRPCClientError<AppRouter> => {
  return e instanceof TRPCClientError;
};
