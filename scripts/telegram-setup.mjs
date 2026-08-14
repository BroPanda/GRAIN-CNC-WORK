/**
 * Підключає Telegram-бота до сайту: реєструє вебхук і перевіряє, що все зійшлося.
 *
 *   node scripts/telegram-setup.mjs https://frezalviv.vercel.app
 *
 * Читає TELEGRAM_BOT_TOKEN і TELEGRAM_WEBHOOK_SECRET з .env.local (або з оточення).
 * Адресу можна не передавати, якщо в .env.local задано APP_URL.
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

// .env.local читаємо самі — скрипт запускається без Next
for (const line of readEnvFile(path.join(ROOT, ".env.local"))) {
  const eq = line.indexOf("=");
  if (eq <= 0 || line.trimStart().startsWith("#")) continue;
  const key = line.slice(0, eq).trim();
  if (!process.env[key]) process.env[key] = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
}

function readEnvFile(file) {
  try {
    return fs.readFileSync(file, "utf8").split(/\r?\n/);
  } catch {
    return [];
  }
}

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const appUrl = (process.argv[2] || process.env.APP_URL || "").replace(/\/+$/, "");

if (!token) fail("Немає TELEGRAM_BOT_TOKEN. Візьміть токен у @BotFather і додайте в .env.local");
if (!appUrl) fail("Вкажіть адресу сайту: node scripts/telegram-setup.mjs https://ваш-сайт");
if (!/^https:\/\//.test(appUrl)) {
  fail(`Telegram приймає лише https. Отримано: ${appUrl}\n` +
    "Локально вебхук не працює — тестуйте на Vercel або через тунель (ngrok тощо).");
}
if (!secret) {
  console.warn("⚠ Немає TELEGRAM_WEBHOOK_SECRET — вебхук буде відкритий для сторонніх запитів.\n" +
    "  Згенеруйте рядок і додайте його і в .env.local, і в змінні оточення на хостингу.\n");
}

function fail(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}

async function api(method, payload) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload ?? {}),
  });
  const data = await res.json();
  if (!data.ok) fail(`${method}: ${data.description}`);
  return data.result;
}

const me = await api("getMe");
console.log(`Бот: @${me.username} (${me.first_name})`);

await api("setWebhook", {
  url: `${appUrl}/api/telegram`,
  ...(secret ? { secret_token: secret } : {}),
  allowed_updates: ["message"],
  drop_pending_updates: true,
});
console.log(`Вебхук: ${appUrl}/api/telegram`);

// кнопка «Запустити» і опис у профілі бота — щоб людині було зрозуміло, що робити
await api("setMyDescription", {
  description:
    "Вхід у задачник FREZALVIV. Підтвердьте свій номер телефону — і отримаєте посилання для входу.",
});
await api("setMyCommands", {
  commands: [{ command: "start", description: "Увійти в задачник" }],
});

const info = await api("getWebhookInfo");
if (info.last_error_message) {
  console.warn(`⚠ Остання помилка доставки: ${info.last_error_message}`);
}

console.log("\n✔ Готово. Перевірте: відкрийте бота, натисніть «Запустити» → «Поділитися номером».");
console.log(`  Не забудьте TELEGRAM_BOT_USERNAME=${me.username} у змінних оточення сайту.`);
