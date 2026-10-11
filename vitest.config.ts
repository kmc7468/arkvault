import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Compiles runes in `.svelte.ts` files
  plugins: [svelte()],
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
          setupFiles: ["tests/setup/polyfills.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "server",
          include: ["tests/server/**/*.test.ts"],
          globalSetup: ["tests/setup/database.ts"],
          setupFiles: ["tests/setup/server.ts"],
          // Test files share a single database
          fileParallelism: false,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
