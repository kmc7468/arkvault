import { beforeEach, describe, expect, it, vi } from "vitest";
import { keyring } from "#lib/client/keys/keyring.svelte.ts";
import type { MasterKey } from "#lib/client/keys/types.ts";

vi.mock("#lib/client/storage/indexed-db/index.ts", () => ({
  getClientKey: vi.fn(async () => null),
  getMasterKeys: vi.fn(async () => []),
  getHmacSecrets: vi.fn(async () => []),
  storeClientKey: vi.fn(async () => {}),
  storeMasterKeys: vi.fn(async () => {}),
  storeHmacSecrets: vi.fn(async () => {}),
}));

const key = {} as CryptoKey;
const masterKey = (version: number, state: MasterKey["state"]): MasterKey => ({
  version,
  state,
  key,
});

beforeEach(async () => {
  await keyring.setMasterKeys([]);
  await keyring.setHmacSecrets([]);
});

describe("Keyring", () => {
  it("uses the latest active master key for new data", async () => {
    await keyring.setMasterKeys([
      masterKey(1, "retired"),
      masterKey(3, "active"),
      masterKey(2, "active"),
    ]);

    expect(keyring.hasMasterKeys).toBe(true);
    expect(keyring.activeMasterKey.version).toBe(3);
  });

  it("finds master keys by version", async () => {
    await keyring.setMasterKeys([masterKey(1, "retired"), masterKey(2, "active")]);

    expect(keyring.getMasterKey(1).state).toBe("retired");
    expect(() => keyring.getMasterKey(3)).toThrow("not found");
  });

  it("throws if there is no active key", async () => {
    await keyring.setMasterKeys([masterKey(1, "retired")]);

    expect(() => keyring.activeMasterKey).toThrow("Active master key not found");
    expect(() => keyring.activeHmacSecret).toThrow("Active HMAC secret not found");
  });

  it("requires client keys", () => {
    expect(() => keyring.requireClientKeys()).toThrow("Client keys not found");
  });
});
