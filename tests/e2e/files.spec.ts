import { expect, test } from "@playwright/test";
import { App } from "./support/app.ts";
import { createLargeAsset, createMediaAssets, type Asset } from "./support/assets.ts";

let app: App;
let image: Asset;
let video: Asset;
let large: Asset;

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

test("폴더를 만든다", async () => {
  await app.page.goto("/directory");
  await app.page.locator("button.pointer-events-auto").click(); // Floating button
  await app.text("폴더 만들기").click();
  await app.field("폴더 이름").fill("문서");
  await app.text("만들기").click();

  await expect(app.row("문서")).toBeVisible();
});

test("파일을 업로드하면 목록에 썸네일과 함께 표시된다", async () => {
  await app.upload([image, video, large]);

  await app.page.reload();
  for (const { name } of [image, video, large]) {
    await expect(app.row(name)).toBeVisible();
  }
  await expect(app.row(image.name).locator("img")).toBeVisible();
  await expect(app.row(video.name).locator("img")).toBeVisible();
});

test("이미지를 서비스 워커가 복호화한 스트림으로 표시한다", async () => {
  await app.openFile(image.name);

  const img = app.page.locator(`img[alt="${image.name}"]`);
  await expect(img).toHaveAttribute("src", /^\/_internal\/decrypted-file\/\d+$/);
  await expect
    .poll(() => img.evaluate((element: HTMLImageElement) => element.naturalWidth))
    .toBe(640);
});

test("폴더 이름을 바꾼다", async () => {
  await app.page.goto("/directory");
  await app.openMenu("문서");
  await app.text("이름 바꾸기").click();
  await app.field("이름").fill("보관함");
  await app.page.getByRole("button", { name: "바꾸기", exact: true }).click();

  await expect(app.row("보관함")).toBeVisible();
});

test("즐겨찾기에 추가하고 즐겨찾기 화면에서 해제한다", async () => {
  await app.page.goto("/directory");
  await app.openMenu(image.name);
  await app.text("즐겨찾기에 추가하기").click();
  await expect(app.text("즐겨찾기에 추가하기")).toBeHidden(); // The menu closes on success

  await app.page.goto("/favorites");
  await expect(app.row(image.name)).toBeVisible();
  await app.row(image.name).locator("#action-button").click();
  await expect(app.row(image.name)).toBeHidden();

  await app.page.goto("/directory");
  await app.openMenu(image.name);
  await expect(app.text("즐겨찾기에 추가하기")).toBeVisible();
});

test("파일 화면의 메뉴에서 즐겨찾기를 전환한다", async () => {
  await app.openFile(video.name);
  const menuButton = app.page.locator("div.sticky button").last();

  await menuButton.click();
  await app.text("즐겨찾기").click();
  await menuButton.click();
  await expect(app.text("즐겨찾기 해제")).toBeVisible();
});

test("카테고리를 만들고 파일을 추가, 제거한 뒤 이름을 바꾸고 삭제한다", async () => {
  const { page } = app;
  await page.goto("/category");
  await app.text("카테고리 추가하기").click();
  await app.field("카테고리 이름").fill("여행");
  await app.text("만들기").click();
  await expect(app.row("여행")).toBeVisible();

  await app.openFile(image.name);
  await app.text("카테고리에 추가하기").click();
  await app.row("여행").click();
  await app.text("여행 카테고리에 추가하기").click();
  await expect(app.row("여행")).toBeVisible();

  await page.goto("/category");
  await app.row("여행").click();
  await page.waitForURL(/\/category\/\d+/);
  await expect(app.row(image.name)).toBeVisible();
  await app.row(image.name).locator("#action-button").click();
  await expect(app.row(image.name)).toBeHidden();

  await page.goto("/category");
  await app.openMenu("여행");
  await app.text("이름 바꾸기").click();
  await app.field("이름").fill("여행 기록");
  await page.getByRole("button", { name: "바꾸기", exact: true }).click();
  await expect(app.row("여행 기록")).toBeVisible();

  await app.openMenu("여행 기록");
  await app.text("삭제하기").click();
  await app.text("삭제할게요").click();
  await expect(app.row("여행 기록")).toBeHidden();
});

test("이름으로 검색한다", async () => {
  await app.page.goto("/search");
  await app.page.locator("input").first().fill("video");

  await expect(app.row(video.name)).toBeVisible();
  await expect(app.row(image.name)).toBeHidden();
});

test("갤러리에 사진과 동영상을 표시한다", async () => {
  await app.page.goto("/gallery");

  await expect(app.page.locator(`img[alt="${image.name}"]`)).toBeVisible();
  await expect(app.page.locator(`img[alt="${video.name}"]`)).toBeVisible();
});

test("누락된 썸네일을 다시 생성한다", async () => {
  const { rowCount } = await app.db.query(
    `DELETE FROM thumbnail WHERE file_id IN (
      SELECT f.id FROM file f JOIN "user" u ON f.user_id = u.id WHERE u.email = $1
    )`,
    [app.email],
  );
  expect(rowCount).toBe(2);

  await app.page.goto("/settings/thumbnail");
  await expect(app.row(image.name)).toBeVisible();
  await expect(app.row(video.name)).toBeVisible();
  await app.text("모두 썸네일 생성하기").click();
  await expect(app.text("썸네일이 누락된 파일")).toBeHidden({ timeout: 60_000 });

  const { rows } = await app.db.query(
    `SELECT count(*)::int AS count FROM thumbnail t
      JOIN file f ON t.file_id = f.id JOIN "user" u ON f.user_id = u.id WHERE u.email = $1`,
    [app.email],
  );
  expect(rows[0].count).toBe(2);
});

test("파일을 삭제한다", async () => {
  await app.page.goto("/directory");
  await app.openMenu(large.name);
  await app.text("삭제하기").click();
  await app.text("삭제할게요").click();
  await expect(app.row(large.name)).toBeHidden();

  await app.page.reload();
  await expect(app.row(image.name)).toBeVisible();
  await expect(app.row(large.name)).toBeHidden();
});

test("폴더를 삭제한다", async () => {
  await app.page.goto("/directory");
  await app.openMenu("보관함");
  await app.text("삭제하기").click();
  await app.text("삭제할게요").click();

  await expect(app.row("보관함")).toBeHidden();
});
