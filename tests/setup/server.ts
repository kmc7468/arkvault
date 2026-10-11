import { mkdtemp } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { vi } from "vitest";

const storagePath = await mkdtemp(join(tmpdir(), "arkvault-test-"));

vi.mock("#lib/server/loadenv.js", async () => {
  const { inject } = await import("vitest");
  return {
    default: {
      nodeEnv: "test",
      database: inject("database"),
      session: { secret: "test-secret", exp: 14 * 24 * 3600 * 1000 },
      challenge: { userClientExp: 5 * 60 * 1000, sessionUpgradeExp: 5 * 60 * 1000 },
      libraryPath: join(storagePath, "library"),
      thumbnailsPath: join(storagePath, "thumbnails"),
    },
  };
});
