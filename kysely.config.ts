import { defineConfig } from "kysely-ctl";
import { createDialect } from "./src/lib/server/db/dialect.ts";

// Empty values (e.g. `DATABASE_HOST=` in .env) are treated as unset, as in src/env.ts
const optional = (name: string) => process.env[name] || undefined;

export default defineConfig({
  dialect: createDialect({
    host: optional("DATABASE_HOST"),
    port: optional("DATABASE_PORT") ? Number(optional("DATABASE_PORT")) : undefined,
    user: optional("DATABASE_USER"),
    password: optional("DATABASE_PASSWORD"),
    name: optional("DATABASE_NAME"),
  }),
  migrations: {
    migrationFolder: "./src/lib/server/db/migrations",
  },
});
