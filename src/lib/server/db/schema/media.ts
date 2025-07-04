import type { Generated } from "kysely";

interface ThumbnailTable {
  id: Generated<number>;
  directory_id: number | null;
  file_id: number | null;
  category_id: number | null;
  path: string;
  created_at: Date;
  encrypted_content_iv: string; // Base64
}

declare module "./index" {
  interface Database {
    thumbnail: ThumbnailTable;
  }
}
