import { defineConfig } from "@playwright/test";
import { BASE_URL } from "./support/app.ts";

// Run with `pnpm test:e2e`, which runs the app and the tests in Docker (see run.sh)
export default defineConfig({
  testDir: ".",
  outputDir: "results",
  globalSetup: "./support/global-setup.ts",
  timeout: 180_000,
  expect: { timeout: 30_000 },
  // Each test file signs up a new user, so files can run in parallel
  workers: 2,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
});
