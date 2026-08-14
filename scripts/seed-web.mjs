/**
 * Демо-наповнення через сам сайт (браузером), а не через базу.
 * Потрібне для хмари: до продакшн-бази прямого доступу немає, а права
 * й черга однаково перевіряються застосунком — тому дані виходять «живі».
 *
 * Запуск: node scripts/seed-web.mjs https://frezalviv.vercel.app
 */
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:3000";

const tasks = [
  {
    title: "Об'ємні літери «АВТОМИР» — фрезерування лиця",
    description:
      "Літери 5 шт, висота 400 мм. Лице з акрилу 3 мм, борт ПВХ 10 мм.\nФреза 6 мм, два проходи, залишити перемички.",
    customer: "ТОВ «Автомир»",
    order_no: "2026-114",
    material: "Акрил",
    thickness_mm: "3",
    quantity: "5",
    priority: "urgent",
    due: 0,
    take: true, // Володя візьме в роботу
  },
  {
    title: "Табличка на фасад ЖК Sunrise",
    description: "Композит 3 мм, гравіювання логотипу, отвори під дистанційники 4 шт.",
    customer: "ЖК Sunrise",
    order_no: "2026-118",
    material: "Композит (АКП)",
    thickness_mm: "3",
    quantity: "2",
    due: 2,
  },
  {
    title: "3D-логотип «КАВА ТУТ» — об'ємна модель",
    description: "Фрезерування по STL, XPS 50 мм, потім шпаклівка. Перевірити глибину рельєфу.",
    customer: "Кава Тут",
    order_no: "2026-121",
    material: "XPS / пінопласт",
    thickness_mm: "50",
    quantity: "1",
    due: 5,
    model: true, // до неї чіпляємо STL
  },
  {
    title: "Стенд Nova Poshta — розкрій деталей",
    description: "Фанера 12 мм, розкрій по DXF, 14 деталей. Пази 12.2 мм.",
    customer: "Нова Пошта",
    order_no: "2026-125",
    material: "Фанера",
    thickness_mm: "12",
    quantity: "14",
    due: 8,
  },
  {
    title: "Вивіска «АПТЕКА» — лайтбокс, лице",
    description: "Молочний акрил 3 мм, фрезерування контуру + вирізи під літери.",
    customer: "Аптека 24",
    order_no: "2026-109",
    material: "Акрил",
    thickness_mm: "3",
    quantity: "1",
    due: -1,
    rework: "У файлі відкриті контури по літерах Т і А — програма не рахує замкнутий шлях.",
  },
];

/** Мінімальний валідний бінарний STL — куб 40×40×20 мм. */
function makeCubeStl() {
  const [x, y, z] = [40, 40, 20];
  const v = [
    [0, 0, 0], [x, 0, 0], [x, y, 0], [0, y, 0],
    [0, 0, z], [x, 0, z], [x, y, z], [0, y, z],
  ];
  const faces = [
    [0, 1, 2], [0, 2, 3], [4, 6, 5], [4, 7, 6],
    [0, 5, 1], [0, 4, 5], [1, 6, 2], [1, 5, 6],
    [2, 7, 3], [2, 6, 7], [3, 4, 0], [3, 7, 4],
  ];
  const buf = Buffer.alloc(84 + faces.length * 50);
  buf.write("FREZALVIV demo cube", 0);
  buf.writeUInt32LE(faces.length, 80);
  let off = 84;
  for (const [a, b, c] of faces) {
    off += 12; // нормаль порахує вьювер
    for (const idx of [a, b, c]) {
      buf.writeFloatLE(v[idx][0], off);
      buf.writeFloatLE(v[idx][1], off + 4);
      buf.writeFloatLE(v[idx][2], off + 8);
      off += 12;
    }
    off += 2;
  }
  return buf;
}

const shift = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

async function loginAs(page, name) {
  await page.context().clearCookies();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: new RegExp(name) }).click();
  await page.waitForURL("**/queue", { timeout: 30000 });
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
const page = await ctx.newPage();

/* ── Світлана створює задачі ── */
await loginAs(page, "Світлана");

// що вже є в черзі — щоб повторний запуск не наплодив дублікатів
await page.goto(`${BASE}/queue`, { waitUntil: "networkidle" });
const existing = (await page.locator("body").textContent()) ?? "";

for (const t of tasks) {
  if (existing.includes(t.title)) {
    console.log(`= вже є, пропускаю: ${t.title}`);
    continue;
  }
  await page.goto(`${BASE}/tasks/new`, { waitUntil: "networkidle" });
  await page.fill("#title", t.title);
  await page.fill("#description", t.description);
  await page.fill("#material", t.material);
  await page.fill("#thickness_mm", t.thickness_mm);
  await page.fill("#quantity", t.quantity);
  await page.fill("#customer", t.customer);
  await page.fill("#order_no", t.order_no);
  await page.fill("#due_date", shift(t.due));
  if (t.priority) await page.selectOption("#priority", t.priority);

  if (t.model) {
    await page.setInputFiles('input[name="files"]', {
      name: "kava-logo.stl",
      mimeType: "model/stl",
      buffer: makeCubeStl(),
    });
  }

  await page.getByRole("button", { name: /Створити і поставити в чергу/ }).click();
  await page.waitForURL("**/queue", { timeout: 60000 });
  console.log(`+ ${t.title}`);
}

/* ── Володя бере одну в роботу і одну повертає на доопрацювання ── */
await loginAs(page, "Володя");

for (const t of tasks.filter((t) => t.take || t.rework)) {
  const card = page.locator("article").filter({ hasText: t.customer }).first();
  const take = card.getByRole("button", { name: /Взяти в роботу/ });
  if ((await take.count()) === 0) {
    console.log(`= вже не в черзі, пропускаю: ${t.title}`);
    continue;
  }
  await take.click();
  await page.waitForTimeout(3000);

  if (!t.rework) {
    console.log(`▶ взято в роботу: ${t.title}`);
    continue;
  }

  const inWork = page.locator("article").filter({ hasText: t.customer }).first();
  await inWork.getByRole("button", { name: /На доопрацювання/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  await dialog.locator("#action-comment").fill(t.rework);
  await dialog.getByRole("button", { name: "Відправити" }).click();
  await page.waitForTimeout(3000);
  console.log(`↩ на доопрацювання: ${t.title}`);
}

await ctx.close();
await browser.close();
console.log(`\nГотово: ${tasks.length} задач на ${BASE}`);
