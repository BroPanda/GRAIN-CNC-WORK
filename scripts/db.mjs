/** Спільне підключення до Postgres для скриптів. */
import { Client } from "pg";
import fs from "node:fs";
import path from "node:path";

const envFile = path.join(process.cwd(), ".env.local");
if (!process.env.DATABASE_URL && fs.existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
if (!url) {
  console.error("Немає DATABASE_URL. Локально спершу запустіть: npm run pg");
  process.exit(1);
}

const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);

export async function connect() {
  const client = new Client({
    connectionString: url,
    ssl: local ? undefined : { rejectUnauthorized: false },
  });
  await client.connect();
  return client;
}
