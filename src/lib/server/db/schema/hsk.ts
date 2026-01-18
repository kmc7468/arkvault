import type { ColumnType, Generated } from "kysely";

export type HskState = "active";

export interface HskTable {
  user_id: number;
  version: number;
  state: HskState;
  master_encryption_key_version: number;
  encrypted_key: string; // Base64
}

export interface HskLogTable {
  id: Generated<number>;
  user_id: number;
  hmac_secret_key_version: number;
  timestamp: ColumnType<Date, Date, never>;
  action: "create";
  action_by: number | null;
}

declare module "./index" {
  interface Database {
    hmac_secret_key: HskTable;
    hmac_secret_key_log: HskLogTable;
  }
}
