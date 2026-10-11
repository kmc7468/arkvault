import { includeIgnoreFile } from "@eslint/compat";
import js from "@eslint/js";
import { loadConfig } from "@sveltejs/load-config";
import { defineConfig } from "eslint/config";
import prettier from "eslint-config-prettier";
import svelte from "eslint-plugin-svelte";
import tailwind from "eslint-plugin-tailwindcss";
import globals from "globals";
import ts from "typescript-eslint";
import { fileURLToPath } from "url";

const svelteConfig = (await loadConfig("./", { traverse: false }))?.config;

const gitignorePath = fileURLToPath(new URL("./.gitignore", import.meta.url));

// Restricts the direction of dependencies between modules
const defineImportBoundaries = (boundaries) =>
  Object.entries(boundaries).map(([files, regex]) => ({
    files: [files],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [{ regex, message: "Violates the dependency direction between modules." }],
        },
      ],
    },
  }));

export default defineConfig(
  includeIgnoreFile(gitignorePath),
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs.recommended,
  tailwind.configs.recommended,
  prettier,
  ...svelte.configs.prettier,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    settings: {
      tailwindcss: {
        cssConfigPath: "./src/app.css",
      },
    },
    rules: {
      "no-undef": "off",
    },
  },
  ...defineImportBoundaries({
    // Pure code shared by the server, the client, and the service worker
    "src/lib/shared/**": "^(#lib/(?!shared/)|#trpc/|#workers/|\\$app/|svelte($|/))",
    "src/lib/server/**": "^(#lib/(client|features|ui)/|#trpc/)",
    // Infrastructure of the browser
    "src/lib/client/**": "^#lib/(server|features|ui)/",
    // Domain-agnostic components
    "src/lib/ui/**": "^(#lib/(server|client|features)/|#trpc/)",
    "src/lib/features/**": "^#lib/server/",
    "src/service-worker/**": "^(#lib/(?!shared/|client/storage/opfs\\.js$)|#trpc/|#workers/)",
  }),
  {
    files: ["**/*.svelte", "**/*.svelte.ts", "**/*.svelte.js"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        extraFileExtensions: [".svelte"],
        parser: ts.parser,
        svelteConfig,
      },
    },
  },
);
