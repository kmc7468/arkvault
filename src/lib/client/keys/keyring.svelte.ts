import {
  getClientKey,
  getHmacSecrets,
  getMasterKeys,
  storeClientKey,
  storeHmacSecrets,
  storeMasterKeys,
} from "#lib/client/storage/indexedDB/index.js";
import type { ClientKeys, HmacSecret, MasterKey } from "./types";

const findLatestActive = <T extends { version: number; state: string }>(
  entries: ReadonlyMap<number, T>,
) => {
  return entries
    .values()
    .filter(({ state }) => state === "active")
    .reduce<T | undefined>(
      (latest, entry) => ((latest?.version ?? 0) > entry.version ? latest : entry),
      undefined,
    );
};

// Holds the keys of this device and the user. Keys are persisted in IndexedDB.
class Keyring {
  clientKeys = $state.raw<ClientKeys | null>(null);
  masterKeys = $state.raw<ReadonlyMap<number, MasterKey>>(new Map());
  hmacSecrets = $state.raw<ReadonlyMap<number, HmacSecret>>(new Map());

  async load() {
    const [encryptKey, decryptKey, signKey, verifyKey, masterKeys, hmacSecrets] = await Promise.all(
      [
        getClientKey("encrypt"),
        getClientKey("decrypt"),
        getClientKey("sign"),
        getClientKey("verify"),
        getMasterKeys(),
        getHmacSecrets(),
      ],
    );
    if (encryptKey && decryptKey && signKey && verifyKey) {
      this.clientKeys = { encryptKey, decryptKey, signKey, verifyKey };
    }
    this.masterKeys = new Map(masterKeys.map((masterKey) => [masterKey.version, masterKey]));
    this.hmacSecrets = new Map(hmacSecrets.map((hmacSecret) => [hmacSecret.version, hmacSecret]));
  }

  // Client keys are kept in memory only until they are registered and persisted
  setClientKeys(clientKeys: ClientKeys) {
    this.clientKeys = clientKeys;
  }

  async persistClientKeys() {
    const clientKeys = this.requireClientKeys();
    await Promise.all([
      storeClientKey(clientKeys.encryptKey, "encrypt"),
      storeClientKey(clientKeys.decryptKey, "decrypt"),
      storeClientKey(clientKeys.signKey, "sign"),
      storeClientKey(clientKeys.verifyKey, "verify"),
    ]);
  }

  async setMasterKeys(masterKeys: MasterKey[]) {
    await storeMasterKeys(masterKeys);
    this.masterKeys = new Map(masterKeys.map((masterKey) => [masterKey.version, masterKey]));
  }

  async setHmacSecrets(hmacSecrets: HmacSecret[]) {
    await storeHmacSecrets(hmacSecrets);
    this.hmacSecrets = new Map(hmacSecrets.map((hmacSecret) => [hmacSecret.version, hmacSecret]));
  }

  get hasMasterKeys() {
    return this.masterKeys.size > 0;
  }

  get hasHmacSecrets() {
    return this.hmacSecrets.size > 0;
  }

  requireClientKeys() {
    if (!this.clientKeys) {
      throw new Error("Client keys not found");
    }
    return this.clientKeys;
  }

  getMasterKey(version: number) {
    const masterKey = this.masterKeys.get(version);
    if (!masterKey) {
      throw new Error(`Master key (version ${version}) not found`);
    }
    return masterKey;
  }

  // The master key used to encrypt new data
  get activeMasterKey() {
    const masterKey = findLatestActive(this.masterKeys);
    if (!masterKey) {
      throw new Error("Active master key not found");
    }
    return masterKey;
  }

  get activeHmacSecret() {
    const hmacSecret = findLatestActive(this.hmacSecrets);
    if (!hmacSecret) {
      throw new Error("Active HMAC secret not found");
    }
    return hmacSecret;
  }
}

export const keyring = new Keyring();
