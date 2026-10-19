import { expect, test } from "@playwright/test";
import { readFile, writeFile } from "fs/promises";
import { App, CHUNK_SIZE, sha256 } from "./support/app.ts";
import { createLargeAsset, createMediaAssets, type Asset } from "./support/assets.ts";

// Values of `HTMLMediaElement.readyState`, as DOM globals aren't available in tests
const HAVE_CURRENT_DATA = 2;

let app: App;
let image: Asset;
let video: Asset;
let large: Asset;
let fileIds: Map<string, number>;

const listUploadCaches = () =>
  app.page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const cache = await root.getDirectoryHandle("cache", { create: true });
    const upload = await cache.getDirectoryHandle("upload", { create: true });
    const names: string[] = [];
    for await (const name of upload.keys()) names.push(name);
    return names;
  });

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browser }) => {
  app = await App.create(browser);
  await app.signUp();
  ({ image, video } = await createMediaAssets(app.page));
  large = createLargeAsset();
});

test.afterAll(async () => {
  await app.close();
});

test("업로드한 파일은 청크 단위로 캐시되고 임시 폴더는 남지 않는다", async () => {
  await app.upload([image, video, large]);
  fileIds = await app.getFileIds();

  for (const asset of [image, video, large]) {
    await app.expectCached(fileIds.get(asset.mimeType)!, asset);
  }
  expect(await listUploadCaches()).toEqual([]);
});

test("일부 구간을 요청하면 해당 청크만 캐시되고, 이후 캐시와 서버의 청크를 함께 사용한다", async () => {
  const id = fileIds.get(large.mimeType)!;
  // Opening the file lets the service worker know its key, and saves it
  const download = app.page.waitForEvent("download");
  await app.openFile(large.name);
  await (await download).path();
  await app.expectCached(id, large);
  await app.clearCache(id);

  const start = CHUNK_SIZE + 10;
  const partial = await app.fetchDecrypted(id, `bytes=${start}-${start + 10}`);
  expect(partial).toMatchObject({
    status: 206,
    hash: sha256(large.buffer.subarray(start, start + 11)),
  });
  await app.expectCached(id, large, [1]);

  // Chunk 1 is read from the cache, and chunks 0 and 2 from the server
  const full = await app.fetchDecrypted(id);
  expect(full).toMatchObject({ status: 200, hash: sha256(large.buffer) });
  await app.expectCached(id, large);
});

test("재생하면서 캐시된 동영상은 다음 재생 때 서버 대신 캐시에서 읽는다", async () => {
  const id = fileIds.get(video.mimeType)!;
  await app.clearCache(id);

  await app.page.goto(`/file/${id}`);
  const element = app.page.locator("video");
  await expect
    .poll(() => element.evaluate((video: HTMLVideoElement) => video.readyState))
    .toBeGreaterThanOrEqual(HAVE_CURRENT_DATA);
  await app.expectCached(id, video);

  // Corrupt the content on the server, so that only the cache can be decrypted
  const path = await app.getFilePath(id);
  const original = await readFile(path);
  await writeFile(path, Buffer.alloc(original.length));
  try {
    await app.page.goto("/directory");
    await app.page.goto(`/file/${id}`);
    await expect
      .poll(() => element.evaluate((video: HTMLVideoElement) => video.readyState))
      .toBeGreaterThanOrEqual(HAVE_CURRENT_DATA);
    expect((await app.fetchDecrypted(id)).hash).toBe(sha256(video.buffer));
  } finally {
    await writeFile(path, original);
  }
});

test("이전 형식의 캐시와 오래된 업로드 임시 폴더는 앱을 시작할 때 삭제된다", async () => {
  const { page } = app;
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const cache = await root.getDirectoryHandle("cache", { create: true });
    const writable = await (await cache.getFileHandle("999999", { create: true })).createWritable();
    await writable.write("plaintext");
    await writable.close();

    // A stale one, and one which might be in progress in another tab
    const upload = await cache.getDirectoryHandle("upload", { create: true });
    await upload.getDirectoryHandle("1000-stale", { create: true });
    await upload.getDirectoryHandle(`${Date.now()}-fresh`, { create: true });
  });
  await page.reload();

  await expect
    .poll(() =>
      page.evaluate(async () => {
        const root = await navigator.storage.getDirectory();
        const cache = await root.getDirectoryHandle("cache");
        return await cache.getFileHandle("999999").then(
          () => true,
          () => false,
        );
      }),
    )
    .toBe(false);
  await expect.poll(listUploadCaches).toEqual([expect.stringMatching(/-fresh$/)]);
});
