import type { ColumnType, Generated } from "kysely";

export type MekState = "active" | "retired" | "dead";

export interface MekTable {
  user_id: number;
  version: number;
  state: MekState;
}

export interface MekLogTable {
  id: Generated<number>;
  user_id: number;
  master_encryption_key_version: number;
  timestamp: ColumnType<Date, Date, never>;
  action: "create";
  action_by: number | null;
}

export interface ClientMekTable {
  user_id: number;
  client_id: number;
  version: number;
  encrypted_key: string; // Base64
  encrypted_key_signature: string; // Base64
}

declare module "./index" {
  interface Database {
    master_encryption_key: MekTable;
    master_encryption_key_log: MekLogTable;
    client_master_encryption_key: ClientMekTable;
  }
}
