import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Compiles runes in `.svelte.ts` files
  plugins: [svelte({ configFile: false })],
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["test/unit/**/*.test.ts"],
          setupFiles: ["test/setup/polyfills.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "server",
          include: ["test/server/**/*.test.ts"],
          globalSetup: ["test/setup/database.ts"],
          setupFiles: ["test/setup/server.ts"],
          // Test files share a single database
          fileParallelism: false,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
