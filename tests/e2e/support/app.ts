import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { createHash, randomUUID } from "crypto";
import pg from "pg";
import type { Asset } from "./assets.ts";

export const BASE_URL = "http://127.0.0.1:4173";
export const CHUNK_SIZE = 4 * 1024 * 1024;
export const PASSWORD = "password1234";

// Argon2 hash of `PASSWORD`, as there is no way to sign up from the app
const PASSWORD_HASH =
  "$argon2id$v=19$m=65536,p=4,t=3$EoYOFfAXppmuwKnIlpIJHg$7WMPMiTlC+474Ch3Ov7z8if5gkjJpdl+e+YDrDXRk1Y";

export const sha256 = (buffer: Uint8Array) => createHash("sha256").update(buffer).digest("hex");

export const createDatabaseClient = async () => {
  const db = new pg.Client({
    host: "database",
    user: "arkvault",
    password: "e2e",
    database: "arkvault",
  });
  await db.connect();
  return db;
};

export const newContext = (browser: Browser) => {
  return browser.newContext({
    baseURL: BASE_URL,
    acceptDownloads: true,
    viewport: { width: 420, height: 900 },
  });
};

// Drives the app as a single user on a single device
export class App {
  private constructor(
    readonly context: BrowserContext,
    readonly page: Page,
    readonly db: pg.Client,
    readonly email: string,
    private readonly ownsDatabase = true,
  ) {}

  static async create(browser: Browser) {
    const db = await createDatabaseClient();
    const email = `e2e-${randomUUID()}@example.com`;
    await db.query(`INSERT INTO "user" (email, nickname, password) VALUES ($1, 'e2e', $2)`, [
      email,
      PASSWORD_HASH,
    ]);

    const context = await newContext(browser);
    return new App(context, await context.newPage(), db, email);
  }

  // Another device of the same user, which doesn't have the keys of this device
  async addDevice(browser: Browser) {
    const context = await newContext(browser);
    return new App(context, await context.newPage(), this.db, this.email, false);
  }

  async close() {
    await this.context.close();
    if (this.ownsDatabase) {
      await this.db.end();
    }
  }

  // Locators

  row(name: string) {
    return this.page.locator("[data-entry-container]", { hasText: name }).first();
  }

  // Inputs are labeled by sibling elements instead of placeholders
  field(label: string) {
    return this.page
      .locator("div.relative", {
        has: this.page.locator("label", { hasText: new RegExp(`^\\s*${label}\\s*$`) }),
      })
      .locator("input")
      .last();
  }

  text(text: string) {
    return this.page.getByText(text, { exact: true }).first();
  }

  // Actions

  async login() {
    await this.page.goto("/home");
    await this.page.waitForURL(/\/auth\/login/);
    await this.field("이메일").fill(this.email);
    await this.field("비밀번호").fill(PASSWORD);
    await this.text("로그인").click();
  }

  async generateKeys() {
    await this.page.waitForURL(/\/key\/generate/);
    await this.text("새 암호 키 생성하기").click();
    await this.page.waitForURL(/\/key\/export/);
    await this.text("내보내지 않을래요").click();
    await this.text("계속할게요").click();
  }

  async signUp() {
    await this.login();
    await this.generateKeys();
    await this.page.waitForURL(/\/home/);
  }

  async openMenu(name: string) {
    await this.row(name).locator("[data-action-button]").click();
  }

  async upload(assets: Asset[]) {
    await this.page.goto("/directory");
    await this.page.locator("input[type=file]").setInputFiles(assets);
    for (const { name } of assets) {
      await expect(this.row(name)).toBeVisible({ timeout: 60_000 });
    }

    // Wait until the uploads are finished
    await expect(this.page.locator("body")).not.toContainText(
      /대기 중|준비 중|암호화하는 중|업로드를 기다리는 중|전송됨/,
      { timeout: 120_000 },
    );
  }

  async openFile(name: string) {
    await this.page.goto("/directory");
    await this.row(name).click();
    await this.page.waitForURL(/\/file\/\d+/);
    return Number(new URL(this.page.url()).pathname.split("/").pop());
  }

  // Database

  async getFileIds() {
    const { rows } = await this.db.query<{ id: number; content_type: string }>(
      `SELECT f.id, f.content_type FROM file f JOIN "user" u ON f.user_id = u.id WHERE u.email = $1`,
      [this.email],
    );
    return new Map(rows.map(({ id, content_type }) => [content_type, id]));
  }

  async getFilePath(fileId: number) {
    const { rows } = await this.db.query<{ path: string }>("SELECT path FROM file WHERE id = $1", [
      fileId,
    ]);
    return rows[0]!.path;
  }

  // Service worker and cache

  async fetchDecrypted(fileId: number, range?: string) {
    return await this.page.evaluate(
      async ({ fileId, range }) => {
        const res = await fetch(`/_internal/decrypted-file/${fileId}`, {
          headers: range ? { Range: range } : {},
        });
        const buffer = await res.arrayBuffer();
        const digest = await crypto.subtle.digest("SHA-256", buffer);
        return {
          status: res.status,
          size: buffer.byteLength,
          hash: Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join(""),
          contentRange: res.headers.get("Content-Range"),
        };
      },
      { fileId, range },
    );
  }

  // Returns the hashes of the cached chunks of the file
  async readCache(fileId: number) {
    return await this.page.evaluate(async (fileId) => {
      const chunks: Record<string, string> = {};
      try {
        const root = await navigator.storage.getDirectory();
        const cache = await root.getDirectoryHandle("cache");
        const files = await cache.getDirectoryHandle("file");
        const directory = await files.getDirectoryHandle(String(fileId));
        for await (const handle of directory.values()) {
          if (handle.kind === "file" && /^\d+$/.test(handle.name)) {
            const buffer = await (await (handle as FileSystemFileHandle).getFile()).arrayBuffer();
            const digest = await crypto.subtle.digest("SHA-256", buffer);
            chunks[handle.name] = Array.from(new Uint8Array(digest), (b) =>
              b.toString(16).padStart(2, "0"),
            ).join("");
          }
        }
      } catch {
        // Not cached
      }
      return chunks;
    }, fileId);
  }

  async clearCache(fileId: number) {
    await this.page.evaluate(async (fileId) => {
      const root = await navigator.storage.getDirectory();
      const cache = await root.getDirectoryHandle("cache", { create: true });
      const files = await cache.getDirectoryHandle("file", { create: true });
      await files.removeEntry(String(fileId), { recursive: true }).catch(() => {});
    }, fileId);
  }

  // Waits until the chunks (all by default) are cached with the content of the asset
  async expectCached(fileId: number, asset: Asset, chunkIndexes?: number[]) {
    const indexes = chunkIndexes ?? [...Array(Math.ceil(asset.buffer.length / CHUNK_SIZE)).keys()];
    const expected = Object.fromEntries(
      indexes.map((index) => [
        String(index),
        sha256(asset.buffer.subarray(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE)),
      ]),
    );
    await expect.poll(() => this.readCache(fileId)).toEqual(expected);
  }
}
