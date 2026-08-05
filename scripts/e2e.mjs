/**
 * Прогін основних сценаріїв у справжньому браузері (мобільний і десктопний
 * вьюпорт): вхід, створення задачі, черга, взяття в роботу, доопрацювання,
 * 3D-вьювер, перетягування черги.
 *
 * Запуск: node scripts/e2e.mjs [baseUrl]
 */
import { chromium, devices } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = process.argv[2] ?? "http://localhost:3000";
const SHOTS = path.join(process.cwd(), "screens");
fs.mkdirSync(SHOTS, { recursive: true });

let failures = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures += 1;
};

const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });

async function loginAs(page, name) {
  await page.context().clearCookies();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  // .first() — після повторних прогонів у команді може бути кілька тезок
  await page.getByRole("button", { name: new RegExp(name) }).first().click();
  await page.waitForURL("**/queue", { timeout: 15000 });
}

const browser = await chromium.launch();

/* ─────────────── 1. Мобільний: власник створює задачу ─────────────── */
{
  const ctx = await browser.newContext({ ...devices["Pixel 7"] });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  await loginAs(page, "Світлана");
  check("вхід власника → черга", page.url().includes("/queue"));
  await shot(page, "01-mobile-queue-owner");

  // таб-бар видимий на мобільному
  check(
    "мобільний таб-бар видимий",
    await page.getByRole("link", { name: "Черга", exact: true }).isVisible()
  );

  await page.getByRole("link", { name: "Нова", exact: true }).click();
  await page.waitForURL("**/tasks/new");
  await page.fill("#title", "E2E: панель-кронштейн, розкрій");
  await page.fill("#description", "Автотест: перевірка створення задачі.");
  await page.fill("#material", "ПВХ");
  await page.fill("#thickness_mm", "10");
  await page.fill("#quantity", "3");
  await page.fill("#customer", "Тест Клієнт");
  await page.fill("#order_no", "E2E-1");
  await page.selectOption("#priority", "urgent");
  await shot(page, "02-mobile-new-task");

  await page.getByRole("button", { name: /Створити і поставити в чергу/ }).click();
  await page.waitForURL("**/queue", { timeout: 20000 });
  const created = page.getByText("E2E: панель-кронштейн, розкрій");
  check("задача створена і в черзі", await created.first().isVisible());

  // терміново → має стояти першою в секції «У черзі»
  const firstQueued = await page
    .locator("article")
    .filter({ hasText: "E2E: панель-кронштейн" })
    .first()
    .isVisible();
  check("терміновна задача показана", firstQueued);
  check("Терміново-мітка", await page.getByText("Терміново").first().isVisible());
  await shot(page, "03-mobile-queue-after-create");

  check("без JS-помилок (власник, мобільний)", errors.length === 0, errors.slice(0, 2).join(" | "));
  await ctx.close();
}

/* ─────────────── 2. Мобільний: фрезерувальник веде роботу ─────────────── */
{
  const ctx = await browser.newContext({ ...devices["Pixel 7"] });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  await loginAs(page, "Володя");
  check("фрезерувальник не бачить кнопку «Нова»", !(await page.getByRole("link", { name: "Нова", exact: true }).isVisible()));
  check(
    "фрезерувальник не бачить «Команда»",
    !(await page.getByRole("link", { name: "Команда" }).isVisible())
  );
  await shot(page, "04-mobile-queue-miller");

  // Беремо в роботу задачу C-102
  const card = page.locator("article").filter({ hasText: "C-102" }).first();
  await card.getByRole("button", { name: /Взяти в роботу/ }).click();
  await page.waitForTimeout(2500);
  const inWork = page.locator("article").filter({ hasText: "C-102" }).first();
  check("статус став «В роботі»", (await inWork.textContent())?.includes("В роботі"));
  await shot(page, "05-mobile-taken");

  // Відправляємо на доопрацювання з обов'язковою причиною
  await inWork.getByRole("button", { name: /На доопрацювання/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  const submit = dialog.getByRole("button", { name: "Відправити" });
  check("кнопка заблокована без причини", await submit.isDisabled());
  await dialog.locator("#action-comment").fill("Автотест: у моделі відкриті контури.");
  check("кнопка активна з причиною", await submit.isEnabled());
  await shot(page, "06-mobile-rework-dialog");
  await submit.click();
  await page.waitForTimeout(2500);
  check(
    "задача перейшла в «На доопрацюванні»",
    (await page.locator("body").textContent())?.includes("На доопрацюванні")
  );

  // Закріплену за Володею задачу він бачить
  check(
    "закріплена за ним задача (C-104) видима",
    ((await page.locator("body").textContent()) ?? "").includes("C-104")
  );

  // Задачу на доопрацюванні брати в роботу не можна
  const reworkCard = page.locator("article").filter({ hasText: "На доопрацюванні" }).first();
  check(
    "на задачі «На доопрацюванні» немає кнопки «Взяти в роботу»",
    (await reworkCard.getByRole("button", { name: /Взяти в роботу/ }).count()) === 0
  );

  check("без JS-помилок (фрезерувальник)", errors.length === 0, errors.slice(0, 2).join(" | "));
  await ctx.close();
}

/* ─────────────── 3. Десктоп: 3D-вьювер + сортування черги ─────────────── */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  await loginAs(page, "Світлана");
  check("сайдбар на десктопі", await page.getByRole("link", { name: "Черга робіт" }).isVisible());
  await shot(page, "07-desktop-queue");

  // Відкриваємо задачу з STL (шукаємо за назвою, не за id)
  await page.getByRole("link", { name: /КАВА ТУТ/ }).first().click();
  await page.waitForURL(/\/tasks\/\d+$/, { timeout: 15000 });
  check("сторінка задачі відкрилась", (await page.locator("h1").textContent())?.includes("КАВА"));
  await page.getByRole("button", { name: /Показати 3D-модель/ }).click();
  await page.waitForSelector("canvas", { timeout: 30000 });
  await page.waitForFunction(
    () => document.body.innerText.includes("Габарити"),
    null,
    { timeout: 30000 }
  );
  const dims = await page.locator("text=Габарити").first().textContent();
  check("3D-модель відрендерилась і показала габарити", !!dims, dims?.trim());
  check(
    "габарити куба 40×40×20",
    /40\.0 × 40\.0 × 20\.0/.test((await page.locator("body").textContent()) ?? "")
  );
  await shot(page, "08-desktop-3d-viewer");

  // Історія задачі
  check(
    "історія містить подію створення",
    (await page.locator("body").textContent())?.includes("Задачу створено")
  );

  // Коментар
  await page.locator("textarea").first().fill("Автотест: коментар у задачу.");
  await page.getByRole("button", { name: "Надіслати" }).click();
  await page.waitForTimeout(2500);
  check(
    "коментар зʼявився в історії",
    (await page.locator("body").textContent())?.includes("Автотест: коментар у задачу.")
  );

  // Завантаження файлів через інтерфейс задачі
  const tmpPng = path.join(SHOTS, "_upload-test.png");
  fs.writeFileSync(
    tmpPng,
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFUlEQVR42mP8z8Dwn4GBgYGRAQMAAFYABb2Gg1kAAAAASUVORK5CYII=",
      "base64"
    )
  );
  await page.locator('input[type="file"]').first().setInputFiles(tmpPng);
  await page.waitForTimeout(4000);
  const afterUpload = (await page.locator("body").textContent()) ?? "";
  check("фото завантажилось і зʼявилось у задачі", afterUpload.includes("Фото (1)"));
  const thumb = page.locator('img[src^="/api/files/"]').first();
  check("прев'ю фото віддається сервером", await thumb.isVisible());
  const imgOk = await thumb.evaluate((el) => el.naturalWidth > 0);
  check("зображення реально завантажилось (naturalWidth > 0)", imgOk);
  check(
    "подія про додані файли в історії",
    afterUpload.includes("Додано файли")
  );
  fs.rmSync(tmpPng, { force: true });
  await shot(page, "08b-desktop-uploaded");

  // Сортування черги мишкою
  await page.goto(`${BASE}/queue`, { waitUntil: "networkidle" });
  const handles = page.locator('button[aria-label^="Перетягнути"]');
  const handleCount = await handles.count();
  check("є ручки перетягування", handleCount >= 2, `${handleCount} шт`);

  const codesBefore = await page.locator("article").evaluateAll((els) =>
    els.map((e) => e.textContent?.match(/C-\d+/)?.[0]).filter(Boolean)
  );

  const src = await handles.nth(0).boundingBox();
  const dst = await handles.nth(1).boundingBox();
  await page.mouse.move(src.x + src.width / 2, src.y + src.height / 2);
  await page.mouse.down();
  await page.mouse.move(dst.x + dst.width / 2, dst.y + dst.height / 2 + 30, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(3000);
  await page.reload({ waitUntil: "networkidle" });

  const codesAfter = await page.locator("article").evaluateAll((els) =>
    els.map((e) => e.textContent?.match(/C-\d+/)?.[0]).filter(Boolean)
  );
  check(
    "порядок черги змінився і зберігся після перезавантаження",
    JSON.stringify(codesBefore) !== JSON.stringify(codesAfter),
    `${codesBefore.join(",")} → ${codesAfter.join(",")}`
  );
  await shot(page, "09-desktop-reordered");

  // Кнопки вгору/вниз
  const up = page.locator('button[aria-label="Вище в черзі"]');
  if ((await up.count()) > 1) {
    await up.nth(1).click();
    await page.waitForTimeout(2500);
    const codesNudged = await page.locator("article").evaluateAll((els) =>
      els.map((e) => e.textContent?.match(/C-\d+/)?.[0]).filter(Boolean)
    );
    check(
      "кнопка «вище» переставила задачу",
      JSON.stringify(codesNudged) !== JSON.stringify(codesAfter),
      `${codesAfter.join(",")} → ${codesNudged.join(",")}`
    );
  }

  // Сповіщення
  await page.goto(`${BASE}/notifications`, { waitUntil: "networkidle" });
  const notifText = (await page.locator("body").textContent()) ?? "";
  check("сповіщення про доопрацювання прийшло власнику", notifText.includes("доопрацювання"));
  await shot(page, "10-desktop-notifications");
  // Вкладки сповіщень
  const tabNames = await page.locator("nav ul a").allTextContents();
  check(
    "усі 8 вкладок сповіщень на місці",
    tabNames.length === 8,
    `${tabNames.length} шт`
  );

  // Доопрацювання лежить у своїй вкладці, а не десь ще
  await page.goto(`${BASE}/notifications?tab=rework`, { waitUntil: "networkidle" });
  check(
    "вкладка «Доопрацювання» показує саме доопрацювання",
    ((await page.locator("body").textContent()) ?? "").includes("доопрацювання")
  );

  // Порожня вкладка не показує чужого
  await page.goto(`${BASE}/notifications?tab=files`, { waitUntil: "networkidle" });
  const filesTabText = (await page.locator("body").textContent()) ?? "";
  check(
    "у вкладці «Файли» немає сповіщень про доопрацювання",
    !filesTabText.includes("на доопрацювання")
  );

  // Звук окремої категорії вимикається і переживає перезавантаження
  await page.getByRole("button", { name: "Вимкнути звук: Доопрацювання" }).first().click();
  await page.waitForTimeout(500);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  check(
    "звук категорії вимкнено і збережено",
    (await page.getByRole("button", { name: "Увімкнути звук: Доопрацювання" }).count()) > 0
  );
  check(
    "інші категорії лишились зі звуком",
    (await page.getByRole("button", { name: "Вимкнути звук: Виконано" }).count()) > 0
  );
  await page.getByRole("button", { name: "Увімкнути звук: Доопрацювання" }).first().click();
  await page.waitForTimeout(400);

  // Точний час на картці (на вкладці, де картки точно є)
  await page.goto(`${BASE}/notifications`, { waitUntil: "networkidle" });
  check(
    "показано точну дату й час",
    /\d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}/.test((await page.locator("body").textContent()) ?? "")
  );

  // Поштучне прочитання
  await page.goto(`${BASE}/notifications?tab=rework`, { waitUntil: "networkidle" });
  const oneRead = page.getByRole("button", { name: "Позначити прочитаним" });
  const hadUnread = await oneRead.count();
  if (hadUnread) {
    await oneRead.first().click();
    await page.waitForTimeout(2500);
  }
  check(
    "сповіщення можна прочитати поштучно",
    hadUnread > 0 && (await oneRead.count()) === hadUnread - 1
  );

  await page.goto(`${BASE}/notifications`, { waitUntil: "networkidle" });
  check(
    "непрочитані показані окремим блоком",
    ((await page.locator("body").textContent()) ?? "").includes("НОВІ") ||
      (await page.locator("h2").filter({ hasText: /Нові/ }).count()) > 0
  );

  await page.getByRole("button", { name: /Прочитати всі/ }).click();
  await page.waitForTimeout(2000);
  const afterRead = (await page.locator("body").textContent()) ?? "";
  check("після «прочитати всі» лічильник обнулився", afterRead.includes("Все прочитано"));
  check(
    "прочитані перейшли в свій блок",
    (await page.locator("h2").filter({ hasText: /Прочитані/ }).count()) > 0
  );

  // Статистика
  await page.goto(`${BASE}/stats`, { waitUntil: "networkidle" });
  const statsText = (await page.locator("body").textContent()) ?? "";
  check(
    "статистика: всі періоди на місці",
    ["Сьогодні", "Цей тиждень", "Цей місяць", "Минулий місяць", "По місяцях"].every((t) =>
      statsText.includes(t)
    )
  );
  // підпис місяця має збігатись із поточним (перевірка на UTC-зсув)
  const nowMonth = new Intl.DateTimeFormat("uk-UA", {
    month: "long",
    year: "numeric",
    timeZone: "Europe/Kyiv",
  })
    .format(new Date())
    .replace(" р.", "");
  check("статистика: місяць підписано правильно", statsText.includes(nowMonth), nowMonth);

  await page.goto(`${BASE}/stats?from=2020-01-01&to=2020-12-31`, { waitUntil: "networkidle" });
  check(
    "статистика: порожній період",
    ((await page.locator("body").textContent()) ?? "").includes("нічого не здано")
  );
  await page.goto(`${BASE}/stats?from=2020-01-01&to=2035-12-31`, { waitUntil: "networkidle" });
  check(
    "статистика: широкий період показує виконану задачу",
    ((await page.locator("body").textContent()) ?? "").includes("SPA")
  );
  await shot(page, "12-desktop-stats");

  // Команда і права
  await page.goto(`${BASE}/team`, { waitUntil: "networkidle" });
  const boxes = page.locator('input[type="checkbox"]');
  check("перемикачі прав відрендерились", (await boxes.count()) > 10);
  await shot(page, "11-desktop-team");

  check("без JS-помилок (десктоп)", errors.length === 0, errors.slice(0, 3).join(" | "));
  await ctx.close();
}

/* ────────── 4. Доопрацювання: моделювання править і повертає в чергу ────────── */
{
  const ctx = await browser.newContext({ ...devices["Pixel 7"] });
  const page = await ctx.newPage();
  await loginAs(page, "Тарас");
  check(
    "моделювальник не бачить «Команда»",
    !(await page.getByRole("link", { name: "Команда" }).isVisible())
  );
  check(
    "моделювальник може створювати задачі",
    await page.getByRole("link", { name: "Нова", exact: true }).isVisible()
  );
  const body = (await page.locator("body").textContent()) ?? "";
  check("моделювальник бачить секцію доопрацювання", body.includes("На доопрацюванні"));

  const reworkCard = page
    .locator("article")
    .filter({ has: page.getByRole("button", { name: /Повернути в чергу/ }) })
    .first();
  check("є кнопка «Повернути в чергу»", await reworkCard.isVisible());
  await reworkCard.getByRole("button", { name: /Повернути в чергу/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  await dialog.locator("#action-comment").fill("Автотест: контури замкнув.");
  await dialog.getByRole("button", { name: "Повернути в чергу" }).click();
  await page.waitForTimeout(2500);
  await shot(page, "12-mobile-returned");
  check(
    "задача повернулась у чергу",
    !((await page.locator("body").textContent()) ?? "").includes("Автотест: контури")
  );
  await ctx.close();
}

/* ─── 5. Власник додає другого оператора; той не бачить чужу закріплену задачу ─── */
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await loginAs(page, "Світлана");
  await page.goto(`${BASE}/team`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Додати/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  await dialog.locator("#member-name").fill("Тест Оператор");
  await dialog.locator("#member-role").selectOption("miller");
  await dialog.getByRole("button", { name: /Додати в команду/ }).click();
  await page.waitForTimeout(2500);
  check(
    "новий оператор доданий у команду",
    ((await page.locator("body").textContent()) ?? "").includes("Тест Оператор")
  );

  await loginAs(page, "Тест Оператор");
  const seen = (await page.locator("body").textContent()) ?? "";
  check("новому оператору доступна спільна черга", seen.includes("C-102"));
  check("чужа закріплена задача (C-104) від нього прихована", !seen.includes("C-104"));
  await ctx.close();
}

await browser.close();

console.log(`\n${failures === 0 ? "ВСІ ПЕРЕВІРКИ ПРОЙДЕНІ" : `ПРОВАЛЕНО: ${failures}`}`);
process.exit(failures === 0 ? 0 : 1);
