import { Kysely, PostgresDialect } from "kysely";
import { Migrator } from "kysely/migration";
import pg from "pg";
import env from "$lib/server/loadenv";
import migrations from "./migrations";
import type { Database } from "./schema";

const dialect = new PostgresDialect({
  pool: new pg.Pool({
    host: env.database.host,
    port: env.database.port,
    user: env.database.user,
    password: env.database.password,
    database: env.database.name,
  }),
});

const db = new Kysely<Database>({ dialect });

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
