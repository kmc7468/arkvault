import type { ColumnType, Generated } from "kysely";

export interface SessionTable {
  id: string;
  user_id: number;
  client_id: number | null;
  created_at: ColumnType<Date, Date, never>;
  last_used_at: Date;
  last_used_by_ip: string | null;
  last_used_by_agent: string | null;
}

export interface SessionUpgradeChallengeTable {
  id: Generated<number>;
  session_id: string;
  client_id: number;
  answer: string; // Base64
  allowed_ip: string;
  expires_at: ColumnType<Date, Date, never>;
}

declare module "./index" {
  interface Database {
    session: SessionTable;
    session_upgrade_challenge: SessionUpgradeChallengeTable;
  }
}
