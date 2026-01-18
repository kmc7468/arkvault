import type { ColumnType, Generated } from "kysely";

export interface ClientTable {
  id: Generated<number>;
  encryption_public_key: string; // Base64
  signature_public_key: string; // Base64
}

export type UserClientState = "challenging" | "pending" | "active";

export interface UserClientTable {
  user_id: number;
  client_id: number;
  state: ColumnType<UserClientState, UserClientState | undefined>;
}

export interface UserClientChallengeTable {
  id: Generated<number>;
  user_id: number;
  client_id: number;
  answer: string; // Base64
  allowed_ip: string;
  expires_at: ColumnType<Date, Date, never>;
}

declare module "./index" {
  interface Database {
    client: ClientTable;
    user_client: UserClientTable;
    user_client_challenge: UserClientChallengeTable;
  }
}
