import { expect, test } from "@playwright/test";
import { readFile } from "fs/promises";
import { App, sha256 } from "./support/app.ts";
import { createLargeAsset, createMediaAssets, type Asset } from "./support/assets.ts";

// Values of `HTMLMediaElement.readyState`, as DOM globals aren't available in tests
const HAVE_METADATA = 1;

let app: App;
let video: Asset;
let large: Asset;
let fileIds: Map<string, number>;

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browser }) => {
  app = await App.create(browser);
  await app.signUp();
  ({ video } = await createMediaAssets(app.page));
  large = createLargeAsset();
  await app.upload([video, large]);
  fileIds = await app.getFileIds();
});

test.afterAll(async () => {
  await app.close();
});

test("동영상을 서비스 워커가 복호화한 스트림으로 재생한다", async () => {
  await app.openFile(video.name);

  const element = app.page.locator("video");
  await expect(element).toHaveAttribute("src", /^\/_internal\/decrypted-file\/\d+$/);
  await expect
    .poll(() => element.evaluate((video: HTMLVideoElement) => video.readyState))
    .toBeGreaterThanOrEqual(HAVE_METADATA);
});

test("서비스 워커가 재시작되어도 페이지에서 메타데이터를 다시 받아 복호화한다", async () => {
  const id = fileIds.get(video.mimeType)!;
  await app.clearCache(id); // Decrypt from the server

  const cdp = await app.context.newCDPSession(app.page);
  await cdp.send("ServiceWorker.enable");
  await cdp.send("ServiceWorker.stopAllWorkers");

  const partial = await app.fetchDecrypted(id, "bytes=0-99");
  expect(partial).toMatchObject({ status: 206, size: 100 });
  const full = await app.fetchDecrypted(id);
  expect(full).toMatchObject({ status: 200, hash: sha256(video.buffer) });
});

test("서비스 워커가 접미사 범위와 만족할 수 없는 범위를 처리한다", async () => {
  const id = fileIds.get(video.mimeType)!;

  const suffix = await app.fetchDecrypted(id, "bytes=-10");
  expect(suffix).toMatchObject({ status: 206, size: 10 });
  expect(suffix.hash).toBe(sha256(video.buffer.subarray(-10)));

  const invalid = await app.fetchDecrypted(id, "bytes=999999999-");
  expect(invalid.status).toBe(416);
});

test("다운로드 API는 Range 요청에만 206으로 응답한다", async () => {
  const id = fileIds.get(video.mimeType)!;
  const result = await app.page.evaluate(async (id) => {
    const full = await fetch(`/api/file/${id}/download`);
    const partial = await fetch(`/api/file/${id}/download`, { headers: { Range: "bytes=0-9" } });
    return {
      full: [full.status, full.headers.get("Content-Range")],
      partial: [partial.status, partial.headers.get("Content-Range")],
    };
  }, id);

  expect(result.full).toEqual([200, null]);
  expect(result.partial[0]).toBe(206);
  expect(result.partial[1]).toMatch(/^bytes 0-9\//);
});

test("큰 파일을 저장하면 내용이 일치하고 진행률이 전체 크기까지 보고된다", async () => {
  const { page } = app;
  await app.clearCache(fileIds.get(large.mimeType)!); // Download from the server
  await page.goto("/directory");
  await page.evaluate(() => {
    const progress: unknown[] = [];
    Object.assign(window, { progress });
    navigator.serviceWorker.addEventListener("message", ({ data }) => {
      if (data.type === "download-progress") progress.push(data);
    });
  });

  const download = page.waitForEvent("download", { timeout: 120_000 });
  await app.row(large.name).click();
  const content = await readFile(await (await download).path());
  expect(sha256(content)).toBe(sha256(large.buffer));

  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { progress: { status: string }[] }).progress.find(
          ({ status }) => status === "completed",
        ),
      ),
    )
    .toMatchObject({ loaded: large.buffer.length, total: large.buffer.length });
});
