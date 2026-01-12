import type { Generated } from "kysely";
import type { Ciphertext } from "./utils";

interface UploadSessionTable {
  id: string;
  type: "file" | "thumbnail" | "migration";
  user_id: number;
  path: string;
  bitmap: Buffer;
  total_chunks: number;
  uploaded_chunks: Generated<number>;
  expires_at: Date;

  parent_id: number | null;
  master_encryption_key_version: number | null;
  encrypted_data_encryption_key: string | null; // Base64
  data_encryption_key_version: Date | null;
  hmac_secret_key_version: number | null;
  content_type: string | null;
  encrypted_name: Ciphertext | null;
  encrypted_created_at: Ciphertext | null;
  encrypted_last_modified_at: Ciphertext | null;
  file_id: number | null;
}

declare module "./index" {
  interface Database {
    upload_session: UploadSessionTable;
  }
}
