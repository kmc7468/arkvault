import { Kysely } from "kysely";
import { Migrator } from "kysely/migration";
import env from "#lib/server/config.ts";
import { createDialect } from "./dialect.ts";
import migrations from "./migrations/index.ts";
import type { Database } from "./schema/index.ts";

const db = new Kysely<Database>({ dialect: createDialect(env.database) });

export const migrateDB = async () => {
  if (env.nodeEnv !== "production") return;

  const migrator = new Migrator({
    db,
    provider: {
      async getMigrations() {
        return migrations;
      },
    },
  });
  const { error, results } = await migrator.migrateToLatest();
  if (error) {
    const migration = results?.find(({ status }) => status === "Error");
    if (migration) {
      console.error(`Migration "${migration.migrationName}" failed.`);
    }
    console.error(error);
    process.exit(1);
  }

  if (results?.length === 0) {
    console.log("Database is up-to-date.");
  } else {
    console.log("Database migration completed.");
  }
};

export default db;
