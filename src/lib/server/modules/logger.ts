import { appendFileSync, existsSync, mkdirSync } from "fs";
import { env } from "$env/dynamic/private";

const LOG_DIR = env.LOG_DIR || "log";

const getLogFilePath = () => {
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return `${LOG_DIR}/arkvault-${date}.log`;
};

const ensureLogDir = () => {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
  }
};

const formatLogLine = (type: string, data: Record<string, unknown>) => {
  const timestamp = new Date().toISOString();
  return JSON.stringify({ timestamp, type, ...data });
};

export const demoLogger = {
  log: (type: string, data: Record<string, unknown>) => {
    const line = formatLogLine(type, data);

    // Output to stdout
    console.log(line);

    // Output to file
    try {
      ensureLogDir();
      appendFileSync(getLogFilePath(), line + "\n", { encoding: "utf-8" });
    } catch (e) {
      console.error("Failed to write to log file:", e);
    }
  },
};
