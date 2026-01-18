import { Kysely } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async (db: Kysely<any>) => {
  // user.ts
  await db.schema
    .createTable("user")
    .addColumn("id", "integer", (col) => col.primaryKey().generatedAlwaysAsIdentity())
    .addColumn("email", "text", (col) => col.unique().notNull())
    .addColumn("nickname", "text", (col) => col.notNull())
    .addColumn("password", "text", (col) => col.notNull())
    .execute();

  // client.ts
  await db.schema
    .createTable("client")
    .addColumn("id", "integer", (col) => col.primaryKey().generatedAlwaysAsIdentity())
    .addColumn("encryption_public_key", "text", (col) => col.unique().notNull())
    .addColumn("signature_public_key", "text", (col) => col.unique().notNull())
    .addUniqueConstraint("client_ak01", ["encryption_public_key", "signature_public_key"])
    .execute();
  await db.schema
    .createTable("user_client")
    .addColumn("user_id", "integer", (col) => col.references("user.id").notNull())
    .addColumn("client_id", "integer", (col) => col.references("client.id").notNull())
    .addColumn("state", "text", (col) => col.notNull().defaultTo("challenging"))
    .addPrimaryKeyConstraint("user_client_pk", ["user_id", "client_id"])
    .execute();
  await db.schema
    .createTable("user_client_challenge")
    .addColumn("id", "integer", (col) => col.primaryKey().generatedAlwaysAsIdentity())
    .addColumn("user_id", "integer", (col) => col.references("user.id").notNull())
    .addColumn("client_id", "integer", (col) => col.references("client.id").notNull())
    .addColumn("answer", "text", (col) => col.unique().notNull())
    .addColumn("allowed_ip", "text", (col) => col.notNull())
    .addColumn("expires_at", "timestamp(3)", (col) => col.notNull())
    .addForeignKeyConstraint(
      "user_client_challenge_fk01",
      ["user_id", "client_id"],
      "user_client",
      ["user_id", "client_id"],
    )
    .execute();

  // session.ts
  await db.schema
    .createTable("session")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("user_id", "integer", (col) => col.references("user.id").notNull())
    .addColumn("client_id", "integer", (col) => col.references("client.id"))
    .addColumn("created_at", "timestamp(3)", (col) => col.notNull())
    .addColumn("last_used_at", "timestamp(3)", (col) => col.notNull())
    .addColumn("last_used_by_ip", "text")
    .addColumn("last_used_by_agent", "text")
    .addUniqueConstraint("session_ak01", ["user_id", "client_id"])
    .execute();
  await db.schema
    .createTable("session_upgrade_challenge")
    .addColumn("id", "integer", (col) => col.primaryKey().generatedAlwaysAsIdentity())
    .addColumn("session_id", "text", (col) => col.references("session.id").unique().notNull())
    .addColumn("client_id", "integer", (col) => col.references("client.id").notNull())
    .addColumn("answer", "text", (col) => col.unique().notNull())
    .addColumn("allowed_ip", "text", (col) => col.notNull())
    .addColumn("expires_at", "timestamp(3)", (col) => col.notNull())
    .execute();

  // mek.ts
  await db.schema
    .createTable("master_encryption_key")
    .addColumn("user_id", "integer", (col) => col.references("user.id").notNull())
    .addColumn("version", "integer", (col) => col.notNull())
    .addColumn("state", "text", (col) => col.notNull())
    .addPrimaryKeyConstraint("master_encryption_key_pk", ["user_id", "version"])
    .execute();
  await db.schema
    .createTable("master_encryption_key_log")
    .addColumn("id", "integer", (col) => col.primaryKey().generatedAlwaysAsIdentity())
    .addColumn("user_id", "integer", (col) => col.references("user.id").notNull())
    .addColumn("master_encryption_key_version", "integer", (col) => col.notNull())
    .addColumn("timestamp", "timestamp(3)", (col) => col.notNull())
    .addColumn("action", "text", (col) => col.notNull())
    .addColumn("action_by", "integer", (col) => col.references("client.id"))
    .addForeignKeyConstraint(
      "master_encryption_key_log_fk01",
      ["user_id", "master_encryption_key_version"],
      "master_encryption_key",
      ["user_id", "version"],
    )
    .execute();
  await db.schema
    .createTable("client_master_encryption_key")
    .addColumn("user_id", "integer", (col) => col.references("user.id").notNull())
    .addColumn("client_id", "integer", (col) => col.references("client.id").notNull())
    .addColumn("version", "integer", (col) => col.notNull())
    .addColumn("encrypted_key", "text", (col) => col.notNull())
    .addColumn("encrypted_key_signature", "text", (col) => col.notNull())
    .addPrimaryKeyConstraint("client_master_encryption_key_pk", ["user_id", "client_id", "version"])
    .addForeignKeyConstraint(
      "client_master_encryption_key_fk01",
      ["user_id", "version"],
      "master_encryption_key",
      ["user_id", "version"],
    )
    .execute();

  // hsk.ts
  await db.schema
    .createTable("hmac_secret_key")
    .addColumn("user_id", "integer", (col) => col.references("user.id").notNull())
    .addColumn("version", "integer", (col) => col.notNull())
    .addColumn("state", "text", (col) => col.notNull())
    .addColumn("master_encryption_key_version", "integer", (col) => col.notNull())
    .addColumn("encrypted_key", "text", (col) => col.unique().notNull())
    .addPrimaryKeyConstraint("hmac_secret_key_pk", ["user_id", "version"])
    .addForeignKeyConstraint(
      "hmac_secret_key_fk01",
      ["user_id", "master_encryption_key_version"],
      "master_encryption_key",
      ["user_id", "version"],
    )
    .execute();
  await db.schema
    .createTable("hmac_secret_key_log")
    .addColumn("id", "integer", (col) => col.primaryKey().generatedAlwaysAsIdentity())
    .addColumn("user_id", "integer", (col) => col.references("user.id").notNull())
    .addColumn("hmac_secret_key_version", "integer", (col) => col.notNull())
    .addColumn("timestamp", "timestamp(3)", (col) => col.notNull())
    .addColumn("action", "text", (col) => col.notNull())
    .addColumn("action_by", "integer", (col) => col.references("client.id"))
    .addForeignKeyConstraint(
      "hmac_secret_key_log_fk01",
      ["user_id", "hmac_secret_key_version"],
      "hmac_secret_key",
      ["user_id", "version"],
    )
    .execute();

  // directory.ts
  await db.schema
    .createTable("directory")
    .addColumn("id", "integer", (col) => col.primaryKey().generatedAlwaysAsIdentity())
    .addColumn("parent_id", "integer", (col) => col.references("directory.id"))
    .addColumn("user_id", "integer", (col) => col.references("user.id").notNull())
    .addColumn("master_encryption_key_version", "integer", (col) => col.notNull())
    .addColumn("encrypted_data_encryption_key", "text", (col) => col.unique().notNull())
    .addColumn("data_encryption_key_version", "timestamp(3)", (col) => col.notNull())
    .addColumn("encrypted_name", "json", (col) => col.notNull())
    .addForeignKeyConstraint(
      "directory_fk01",
      ["user_id", "master_encryption_key_version"],
      "master_encryption_key",
      ["user_id", "version"],
    )
    .execute();
  await db.schema
    .createTable("directory_log")
    .addColumn("id", "integer", (col) => col.primaryKey().generatedAlwaysAsIdentity())
    .addColumn("directory_id", "integer", (col) =>
      col.references("directory.id").onDelete("cascade").notNull(),
    )
    .addColumn("timestamp", "timestamp(3)", (col) => col.notNull())
    .addColumn("action", "text", (col) => col.notNull())
    .addColumn("new_name", "json")
    .execute();

  // file.ts
  await db.schema
    .createTable("file")
    .addColumn("id", "integer", (col) => col.primaryKey().generatedAlwaysAsIdentity())
    .addColumn("parent_id", "integer", (col) => col.references("directory.id"))
    .addColumn("user_id", "integer", (col) => col.references("user.id").notNull())
    .addColumn("path", "text", (col) => col.unique().notNull())
    .addColumn("master_encryption_key_version", "integer", (col) => col.notNull())
    .addColumn("encrypted_data_encryption_key", "text", (col) => col.unique().notNull())
    .addColumn("data_encryption_key_version", "timestamp(3)", (col) => col.notNull())
    .addColumn("hmac_secret_key_version", "integer")
    .addColumn("content_hmac", "text")
    .addColumn("content_type", "text", (col) => col.notNull())
    .addColumn("encrypted_content_iv", "text", (col) => col.notNull())
    .addColumn("encrypted_content_hash", "text", (col) => col.notNull())
    .addColumn("encrypted_name", "json", (col) => col.notNull())
    .addColumn("encrypted_created_at", "json")
    .addColumn("encrypted_last_modified_at", "json", (col) => col.notNull())
    .addForeignKeyConstraint(
      "file_fk01",
      ["user_id", "master_encryption_key_version"],
      "master_encryption_key",
      ["user_id", "version"],
    )
    .addForeignKeyConstraint(
      "file_fk02",
      ["user_id", "hmac_secret_key_version"],
      "hmac_secret_key",
      ["user_id", "version"],
    )
    .execute();
  await db.schema
    .createTable("file_log")
    .addColumn("id", "integer", (col) => col.primaryKey().generatedAlwaysAsIdentity())
    .addColumn("file_id", "integer", (col) =>
      col.references("file.id").onDelete("cascade").notNull(),
    )
    .addColumn("timestamp", "timestamp(3)", (col) => col.notNull())
    .addColumn("action", "text", (col) => col.notNull())
    .addColumn("new_name", "json")
    .execute();
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async (db: Kysely<any>) => {
  await db.schema.dropTable("file_log").execute();
  await db.schema.dropTable("file").execute();
  await db.schema.dropTable("directory_log").execute();
  await db.schema.dropTable("directory").execute();
  await db.schema.dropTable("hmac_secret_key_log").execute();
  await db.schema.dropTable("hmac_secret_key").execute();
  await db.schema.dropTable("client_master_encryption_key").execute();
  await db.schema.dropTable("master_encryption_key_log").execute();
  await db.schema.dropTable("master_encryption_key").execute();
  await db.schema.dropTable("session_upgrade_challenge").execute();
  await db.schema.dropTable("session").execute();
  await db.schema.dropTable("user_client_challenge").execute();
  await db.schema.dropTable("user_client").execute();
  await db.schema.dropTable("client").execute();
  await db.schema.dropTable("user").execute();
};
