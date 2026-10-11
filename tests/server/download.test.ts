import { mkdtemp, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { buffer } from "stream/consumers";
import type { ReadableStream } from "stream/web";
import { describe, expect, it } from "vitest";
import { createEncContentStream } from "#lib/server/storage/index.js";

const createFile = async (content: string) => {
  const path = join(await mkdtemp(join(tmpdir(), "arkvault-test-")), "file");
  await writeFile(path, content);
  return path;
};

const read = async (stream: unknown) => (await buffer(stream as ReadableStream)).toString();

describe("createEncContentStream", () => {
  it("serves the whole content when no range is requested", async () => {
    const path = await createFile("0123456789");

    const { encContentStream, range, isRangeRequest } = await createEncContentStream(path);

    expect(isRangeRequest).toBe(false);
    expect(range).toEqual({ start: 0, end: 9, total: 10 });
    expect(await read(encContentStream)).toBe("0123456789");
  });

  it("serves the requested range", async () => {
    const path = await createFile("0123456789");

    const { encContentStream, range, isRangeRequest } = await createEncContentStream(
      path,
      undefined,
      { start: 2, end: 5 },
    );

    expect(isRangeRequest).toBe(true);
    expect(range).toEqual({ start: 2, end: 5, total: 10 });
    expect(await read(encContentStream)).toBe("2345");
  });

  it("prepends the legacy IV to the content", async () => {
    const path = await createFile("6789");

    const { encContentStream } = await createEncContentStream(path, Buffer.from("012345"), {
      start: 4,
      end: 7,
    });

    expect(await read(encContentStream)).toBe("4567");
  });
});
