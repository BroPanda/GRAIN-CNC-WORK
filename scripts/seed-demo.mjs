/**
 * Демо-наповнення задачника: кілька типових робіт ЧПУ + STL-модель.
 * Запуск: node scripts/seed-demo.mjs
 */
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const db = new DatabaseSync(path.join(root, "data", "grain.db"));

const tasks = [
  {
    code: "C-101",
    title: "Об'ємні літери «АВТОМИР» — фрезерування лиця",
    description:
      "Літери 5 шт, висота 400 мм. Лице з акрилу 3 мм, борт ПВХ 10 мм.\nФреза 6 мм, два проходи, залишити перемички.",
    customer: "ТОВ «Автомир»",
    order_no: "2026-114",
    material: "Акрил",
    thickness_mm: 3,
    quantity: 5,
    priority: "urgent",
    due: 0,
    status: "in_progress",
    worker: 3,
  },
  {
    code: "C-102",
    title: "Табличка на фасад ЖК Sunrise",
    description: "Композит 3 мм, гравіювання логотипу, отвори під дистанційники 4 шт.",
    customer: "ЖК Sunrise",
    order_no: "2026-118",
    material: "Композит (АКП)",
    thickness_mm: 3,
    quantity: 2,
    priority: "normal",
    due: 2,
    status: "queued",
  },
  {
    code: "C-103",
    title: "3D-логотип «КАВА ТУТ» — об'ємна модель",
    description: "Фрезерування по STL, XPS 50 мм, потім шпаклівка. Перевірити глибину рельєфу.",
    customer: "Кава Тут",
    order_no: "2026-121",
    material: "XPS / пінопласт",
    thickness_mm: 50,
    quantity: 1,
    priority: "normal",
    due: 5,
    status: "queued",
    model: true,
  },
  {
    code: "C-104",
    title: "Стенд Nova Poshta — розкрій деталей",
    description: "Фанера 12 мм, розкрій по DXF, 14 деталей. Пази 12.2 мм.",
    customer: "Нова Пошта",
    order_no: "2026-125",
    material: "Фанера",
    thickness_mm: 12,
    quantity: 14,
    priority: "normal",
    due: 8,
    status: "queued",
    assignee: 3,
  },
  {
    code: "C-105",
    title: "Вивіска «АПТЕКА» — лайтбокс, лице",
    description: "Молочний акрил 3 мм, фрезерування контуру + вирізи під літери.",
    customer: "Аптека 24",
    order_no: "2026-109",
    material: "Акрил",
    thickness_mm: 3,
    quantity: 1,
    priority: "normal",
    due: -1,
    status: "rework",
    reworkReason:
      "У файлі відкриті контури по літерах Т і А — програма не рахує замкнутий шлях. Треба перезбирати вектор.",
  },
  {
    code: "C-106",
    title: "Букви «SPA» — латунь, гравіювання",
    description: "Латунь 2 мм, гравіювання + поліровка.",
    customer: "SPA Relax",
    order_no: "2026-098",
    material: "Латунь",
    thickness_mm: 2,
    quantity: 3,
    priority: "normal",
    due: -6,
    status: "done",
    worker: 3,
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
  buf.write("GRAIN demo cube", 0);
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

db.exec("DELETE FROM notifications; DELETE FROM task_events; DELETE FROM task_files; DELETE FROM tasks");
// скидаємо автоінкремент, щоб id задач збігались із кодами C-101…C-106
db.exec("DELETE FROM sqlite_sequence WHERE name IN ('tasks','task_files','task_events','notifications')");
fs.rmSync(path.join(root, "data", "uploads"), { recursive: true, force: true });

const insertTask = db.prepare(`
  INSERT INTO tasks (code, title, description, customer, order_no, material, thickness_mm,
    quantity, priority, due_date, status, assignee_id, worker_id, queue_pos, created_by,
    started_at, finished_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
`);
const insertEvent = db.prepare(
  "INSERT INTO task_events (task_id, actor_id, type, comment) VALUES (?, ?, ?, ?)"
);
const insertFile = db.prepare(`
  INSERT INTO task_files (task_id, kind, original_name, stored_name, ext, size_bytes, uploaded_by)
  VALUES (?, ?, ?, ?, ?, ?, 1)
`);
const insertNotif = db.prepare(
  "INSERT INTO notifications (user_id, task_id, actor_id, type, text) VALUES (?, ?, ?, ?, ?)"
);

tasks.forEach((t, i) => {
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");
  const info = insertTask.run(
    t.code,
    t.title,
    t.description,
    t.customer,
    t.order_no,
    t.material,
    t.thickness_mm,
    t.quantity,
    t.priority,
    shift(t.due),
    t.status,
    t.assignee ?? null,
    t.worker ?? null,
    i + 1,
    t.status === "in_progress" || t.status === "done" ? now : null,
    t.status === "done" ? now : null
  );
  const id = Number(info.lastInsertRowid);

  const MILLER = 3; // Володя
  insertEvent.run(id, 1, "created", "");
  if (t.worker) insertEvent.run(id, t.worker, "taken", "");
  if (t.status === "done") insertEvent.run(id, t.worker ?? MILLER, "done", "Здано, упаковано.");
  if (t.reworkReason) {
    insertEvent.run(id, MILLER, "rework", t.reworkReason);
    // сповіщення летять власнику і відділу моделювання
    const text = `Володя відправив ${t.code} «${t.title}» на доопрацювання: ${t.reworkReason}`;
    insertNotif.run(1, id, MILLER, "rework", text);
    insertNotif.run(2, id, MILLER, "rework", text);
  }
  if (t.worker && t.status === "in_progress") {
    insertNotif.run(1, id, t.worker, "taken", `Володя взяв у роботу ${t.code} «${t.title}»`);
  }

  if (t.model) {
    const dir = path.join(root, "data", "uploads", String(id));
    fs.mkdirSync(dir, { recursive: true });
    const stored = `${crypto.randomUUID()}.stl`;
    const stl = makeCubeStl();
    fs.writeFileSync(path.join(dir, stored), stl);
    insertFile.run(id, "model", "kava-logo.stl", stored, "stl", stl.byteLength);
  }
});

console.log(`Готово: ${tasks.length} задач у базі.`);
