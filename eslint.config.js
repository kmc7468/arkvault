import { includeIgnoreFile } from "@eslint/compat";
import js from "@eslint/js";
import svelteQuery from "@tanstack/eslint-plugin-query";
import prettier from "eslint-config-prettier";
import svelte from "eslint-plugin-svelte";
import tailwind from "eslint-plugin-tailwindcss";
import globals from "globals";
import ts from "typescript-eslint";
import { fileURLToPath } from "url";

const gitignorePath = fileURLToPath(new URL("./.gitignore", import.meta.url));

export default ts.config(
  includeIgnoreFile(gitignorePath),
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs["flat/recommended"],
  ...tailwind.configs["flat/recommended"],
  prettier,
  ...svelte.configs["flat/prettier"],
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    files: ["**/*.svelte"],
    languageOptions: {
      parserOptions: {
        parser: ts.parser,
      },
    },
  },
  ...svelteQuery.configs["flat/recommended"],
);
