import type { ColumnType, Generated } from "kysely";
import type { Ciphertext } from "./utils";

export interface DirectoryTable {
  id: Generated<number>;
  parent_id: number | null;
  user_id: number;
  master_encryption_key_version: number;
  encrypted_data_encryption_key: string; // Base64
  data_encryption_key_version: Date;
  encrypted_name: Ciphertext;
  is_favorite: Generated<boolean>;
}

export interface DirectoryLogTable {
  id: Generated<number>;
  directory_id: number;
  timestamp: ColumnType<Date, Date, never>;
  action: "create" | "rename" | "add-to-favorites" | "remove-from-favorites";
  new_name: Ciphertext | null;
}

declare module "./index" {
  interface Database {
    directory: DirectoryTable;
    directory_log: DirectoryLogTable;
  }
}
