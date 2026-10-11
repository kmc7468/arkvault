import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Kysely, PostgresDialect } from "kysely";
import { Migrator } from "kysely/migration";
import pg from "pg";
import type { TestProject } from "vitest/node";
import migrations from "../../src/lib/server/db/migrations/index.ts";

declare module "vitest" {
  export interface ProvidedContext {
    database: {
      host: string;
      port: number;
      user: string;
      password: string;
      name: string;
    };
  }
}

let container: StartedPostgreSqlContainer | undefined;

export const setup = async (project: TestProject) => {
  container = await new PostgreSqlContainer("postgres:17").start();

  const database = {
    host: container.getHost(),
    port: container.getPort(),
    user: container.getUsername(),
    password: container.getPassword(),
    name: container.getDatabase(),
  };

  const db = new Kysely({
    dialect: new PostgresDialect({
      pool: new pg.Pool({ ...database, database: database.name }),
    }),
  });
  try {
    const { error } = await new Migrator({
      db,
      provider: { getMigrations: async () => migrations },
    }).migrateToLatest();
    if (error) throw error;
  } finally {
    await db.destroy();
  }

  project.provide("database", database);
};

export const teardown = async () => {
  await container?.stop();
};
