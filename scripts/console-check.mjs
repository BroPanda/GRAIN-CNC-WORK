/**
 * Перевірка консолі на всіх сторінках у чистому браузері (без розширень).
 * Запуск: node scripts/console-check.mjs [baseUrl]
 */
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:3000";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
const page = await ctx.newPage();

const problems = [];
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") {
    problems.push(`${m.type()}: ${m.text()}`);
  }
});
page.on("requestfailed", (r) =>
  problems.push(`request failed: ${r.url()} — ${r.failure()?.errorText}`)
);

await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /Юрій Грінь/ }).click();
await page.waitForURL("**/queue");

for (const url of ["/queue", "/queue?f=mine", "/queue?f=hot", "/archive", "/notifications", "/team", "/tasks/new"]) {
  await page.goto(`${BASE}${url}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  console.log(`  перевірено ${url}`);
}

// сторінка задачі + 3D-вьювер
await page.goto(`${BASE}/queue`, { waitUntil: "networkidle" });
await page.getByRole("link", { name: /КАВА ТУТ/ }).first().click();
await page.waitForURL(/\/tasks\/\d+$/);
await page.getByRole("button", { name: /Показати 3D-модель/ }).click();
await page.waitForSelector("canvas");
await page.waitForFunction(() => document.body.innerText.includes("Габарити"), null, {
  timeout: 30000,
});
await page.waitForTimeout(1500);
console.log("  перевірено сторінку задачі з 3D-вьювером");

await browser.close();

if (problems.length === 0) {
  console.log("\nКОНСОЛЬ ЧИСТА — жодної помилки чи попередження.");
} else {
  console.log(`\nЗНАЙДЕНО ${problems.length}:`);
  problems.forEach((p) => console.log(` - ${p}`));
}
process.exit(problems.length === 0 ? 0 : 1);
