import type { Generated } from "kysely";
import type { Ciphertext } from "./utils";

interface CategoryTable {
  id: Generated<number>;
  parent_id: number | null;
  user_id: number;
  master_encryption_key_version: number;
  encrypted_data_encryption_key: string; // Base64
  data_encryption_key_version: Date;
  encrypted_name: Ciphertext;
}

interface CategoryLogTable {
  id: Generated<number>;
  category_id: number;
  timestamp: Date;
  action: "create" | "rename";
  new_name: Ciphertext | null;
}

declare module "./index" {
  interface Database {
    category: CategoryTable;
    category_log: CategoryLogTable;
  }
}
