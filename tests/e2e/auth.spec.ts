import { expect, test } from "@playwright/test";
import { App } from "./support/app.ts";

let app: App;

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browser }) => {
  app = await App.create(browser);
});

test.afterAll(async () => {
  await app.close();
});

test("로그인 후 새 암호 키를 생성하면 홈으로 이동한다", async () => {
  await app.login();
  await app.generateKeys();
  await app.page.waitForURL(/\/home/);
});

test("비밀번호를 바꾸지 못하면 오류를 토스트로 표시한다", async () => {
  const { page } = app;
  await page.goto("/auth/change-password");
  await app.field("기존 비밀번호").fill("wrong-password");
  await app.field("새 비밀번호").fill("new-password-1234");
  await app.field("새 비밀번호 확인").fill("new-password-1234");
  await page.getByRole("button", { name: "비밀번호 바꾸기" }).click();

  await expect(page.getByRole("alert")).toContainText("비밀번호를 바꾸지 못했어요");
  await expect(page).toHaveURL(/\/auth\/change-password/);
});

test("저장된 키가 있으면 다시 로그인할 때 키를 생성하지 않는다", async () => {
  await app.page.goto("/menu");
  await app.text("로그아웃").click();
  await app.page.waitForURL(/\/auth\/login/);

  await app.login();
  await app.page.waitForURL(/\/home/);
});

test("새 디바이스는 다른 디바이스의 승인을 기다린다", async ({ browser }) => {
  const device = await app.addDevice(browser);
  const { page } = device;

  try {
    await device.login();
    await device.generateKeys();
    await page.waitForURL(/\/client\/pending/);
    await expect(page.getByText("암호 키 지문", { exact: true })).toBeVisible();
    await expect(page.locator("body")).toContainText(/[0-9A-F]{4} [0-9A-F]{4}/);

    await page.waitForTimeout(1000);
    await expect(page).toHaveURL(/\/client\/pending/);
  } finally {
    await device.close();
  }
});
