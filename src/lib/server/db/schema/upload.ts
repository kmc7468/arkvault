import type { Generated } from "kysely";
import type { Ciphertext } from "./util";

interface UploadSessionTable {
  id: Generated<string>;
  user_id: number;
  total_chunks: number;
  uploaded_chunks: Generated<number[]>;
  expires_at: Date;

  parent_id: number | null;
  master_encryption_key_version: number;
  encrypted_data_encryption_key: string; // Base64
  data_encryption_key_version: Date;
  hmac_secret_key_version: number | null;
  content_type: string;
  encrypted_name: Ciphertext;
  encrypted_created_at: Ciphertext | null;
  encrypted_last_modified_at: Ciphertext;
}

declare module "./index" {
  interface Database {
    upload_session: UploadSessionTable;
  }
}
