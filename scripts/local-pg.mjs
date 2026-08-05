/**
 * Локальний Postgres для розробки й тестів (без Docker).
 * Піднімає справжній сервер Postgres у каталозі data/pg на порті 5433.
 *
 * Запуск: node scripts/local-pg.mjs   (працює до Ctrl+C)
 */
import EmbeddedPostgres from "embedded-postgres";
import path from "node:path";
import fs from "node:fs";

const DATA_DIR = path.join(process.cwd(), "data", "pg");
const PORT = 5433;
const USER = "grain";
const PASSWORD = "grain";
const DB = "grain";

const fresh = !fs.existsSync(DATA_DIR);

const pg = new EmbeddedPostgres({
  databaseDir: DATA_DIR,
  user: USER,
  password: PASSWORD,
  port: PORT,
  persistent: true,
  // UTF-8 обов'язково: інакше на українській системній локалі initdb
  // створює кластер у WIN1251, і частина символів не зберігається.
  // У хмарі (Neon/Vercel) база теж UTF-8 — тримаємо однакові умови.
  initdbFlags: ["--encoding=UTF8", "--no-locale"],
});

if (fresh) {
  console.log("Ініціалізація кластера Postgres (тільки перший раз)…");
  await pg.initialise();
}

await pg.start();

if (fresh) {
  await pg.createDatabase(DB);
}

const url = `postgresql://${USER}:${PASSWORD}@localhost:${PORT}/${DB}`;
fs.writeFileSync(path.join(process.cwd(), ".env.local"), `DATABASE_URL=${url}\n`);

console.log(`Postgres працює: ${url}`);
console.log("DATABASE_URL записано в .env.local — можна запускати npm run dev");
console.log("Ctrl+C щоб зупинити");

const stop = async () => {
  console.log("\nЗупиняю Postgres…");
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
// тримаємо процес живим
setInterval(() => {}, 1 << 30);
