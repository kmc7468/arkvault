export interface ClientKeys {
  encryptKey: CryptoKey;
  decryptKey: CryptoKey;
  signKey: CryptoKey;
  verifyKey: CryptoKey;
}

export interface MasterKey {
  version: number;
  state: "active" | "retired";
  key: CryptoKey;
}

export interface HmacSecret {
  version: number;
  state: "active";
  secret: CryptoKey;
}
