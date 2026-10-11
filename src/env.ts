import { building } from "$app/env";
import { defineEnvVars } from "@sveltejs/kit/env";
import ms, { type StringValue } from "ms";

// Empty values (e.g. `LIBRARY_PATH=` in .env) are treated as unset

const required = (value: string | undefined) => {
  if (!value && !building) throw new Error("Required environment variable not set");
  return value ?? "";
};

const optional = (value: string | undefined) => value || undefined;

const withDefault = (defaultValue: string) => (value: string | undefined) => value || defaultValue;

const duration = (defaultValue: StringValue) => (value: string | undefined) => {
  const result = ms((value || defaultValue) as StringValue);
  if (!Number.isFinite(result)) throw new Error(`Invalid duration: ${value}`);
  return result;
};

export const variables = defineEnvVars({
  NODE_ENV: { schema: withDefault("development") },

  DATABASE_HOST: { schema: optional },
  DATABASE_PORT: {
    schema: (value) => {
      if (!value) return undefined;
      const port = Number(value);
      if (!Number.isInteger(port)) throw new Error(`Invalid port: ${value}`);
      return port;
    },
  },
  DATABASE_USER: { schema: optional },
  DATABASE_PASSWORD: { schema: required },
  DATABASE_NAME: { schema: optional },

  SESSION_SECRET: { schema: required },
  SESSION_EXPIRES: { schema: duration("14d") },
  USER_CLIENT_CHALLENGE_EXPIRES: { schema: duration("5m") },
  SESSION_UPGRADE_CHALLENGE_EXPIRES: { schema: duration("5m") },

  LIBRARY_PATH: { schema: withDefault("library") },
  THUMBNAILS_PATH: { schema: withDefault("thumbnails") },
});
