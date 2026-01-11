import type { ColumnType, Generated } from "kysely";
import type { Ciphertext } from "./utils";

interface DirectoryTable {
  id: Generated<number>;
  parent_id: number | null;
  user_id: number;
  master_encryption_key_version: number;
  encrypted_data_encryption_key: string; // Base64
  data_encryption_key_version: Date;
  encrypted_name: Ciphertext;
}

interface DirectoryLogTable {
  id: Generated<number>;
  directory_id: number;
  timestamp: ColumnType<Date, Date, never>;
  action: "create" | "rename";
  new_name: Ciphertext | null;
}

interface FileTable {
  id: Generated<number>;
  parent_id: number | null;
  user_id: number;
  path: string;
  master_encryption_key_version: number;
  encrypted_data_encryption_key: string; // Base64
  data_encryption_key_version: Date;
  hmac_secret_key_version: number | null;
  content_hmac: string | null; // Base64
  content_type: string;
  encrypted_content_iv: string | null; // Base64
  encrypted_content_hash: string; // Base64
  encrypted_name: Ciphertext;
  encrypted_created_at: Ciphertext | null;
  encrypted_last_modified_at: Ciphertext;
}

interface FileLogTable {
  id: Generated<number>;
  file_id: number;
  timestamp: ColumnType<Date, Date, never>;
  action: "create" | "rename" | "add-to-category" | "remove-from-category";
  new_name: Ciphertext | null;
  category_id: number | null;
}

interface FileCategoryTable {
  file_id: number;
  category_id: number;
}

declare module "./index" {
  interface Database {
    directory: DirectoryTable;
    directory_log: DirectoryLogTable;
    file: FileTable;
    file_log: FileLogTable;
    file_category: FileCategoryTable;
  }
}
