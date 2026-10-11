import { PostgresDialect } from "kysely";
import pg from "pg";

export interface DatabaseConfig {
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  name?: string;
}

export const createDialect = (config: DatabaseConfig) => {
  return new PostgresDialect({
    pool: new pg.Pool({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.name,
    }),
  });
};
