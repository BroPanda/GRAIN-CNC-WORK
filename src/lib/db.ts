import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "grain.db");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  name               TEXT    NOT NULL,
  telegram_username  TEXT,
  role               TEXT    NOT NULL CHECK (role IN ('owner','modeler','miller')),
  position           TEXT,
  is_active          INTEGER NOT NULL DEFAULT 1,
  -- права (для власника гарантовано ігноруються — він має все)
  can_create_tasks   INTEGER NOT NULL DEFAULT 0,
  can_edit_tasks     INTEGER NOT NULL DEFAULT 0,
  can_reorder_queue  INTEGER NOT NULL DEFAULT 0,
  can_upload_files   INTEGER NOT NULL DEFAULT 0,
  can_take_tasks     INTEGER NOT NULL DEFAULT 0,
  can_close_tasks    INTEGER NOT NULL DEFAULT 0,
  can_manage_team    INTEGER NOT NULL DEFAULT 0,
  created_at         TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  code          TEXT,
  title         TEXT    NOT NULL,
  description   TEXT    NOT NULL DEFAULT '',
  customer      TEXT    NOT NULL DEFAULT '',
  order_no      TEXT    NOT NULL DEFAULT '',
  material      TEXT    NOT NULL DEFAULT '',
  thickness_mm  REAL,
  quantity      INTEGER NOT NULL DEFAULT 1,
  priority      TEXT    NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','urgent')),
  due_date      TEXT,
  status        TEXT    NOT NULL DEFAULT 'queued'
                CHECK (status IN ('queued','in_progress','rework','done','cancelled')),
  -- NULL = задача у спільному пулі; інакше закріплена за конкретним фрезерувальником
  assignee_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  -- хто зараз фізично виконує (проставляється при «Взяти в роботу»)
  worker_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  queue_pos     REAL    NOT NULL DEFAULT 0,
  created_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  started_at    TEXT,
  finished_at   TEXT
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status, queue_pos);

CREATE TABLE IF NOT EXISTS task_files (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id       INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  kind          TEXT    NOT NULL CHECK (kind IN ('image','model','doc')),
  original_name TEXT    NOT NULL,
  stored_name   TEXT    NOT NULL,
  ext           TEXT    NOT NULL,
  size_bytes    INTEGER NOT NULL DEFAULT 0,
  uploaded_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_files_task ON task_files(task_id);

CREATE TABLE IF NOT EXISTS task_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id    INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  actor_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  type       TEXT    NOT NULL,
  comment    TEXT    NOT NULL DEFAULT '',
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_events_task ON task_events(task_id, id);

CREATE TABLE IF NOT EXISTS notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id    INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  actor_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  type       TEXT    NOT NULL,
  text       TEXT    NOT NULL,
  read_at    TEXT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read_at, id);
`;

function open(): DatabaseSync {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new DatabaseSync(DB_PATH);

  // WAL + очікування замка: під час білду Next відкриває БД з кількох воркерів
  db.exec("PRAGMA busy_timeout = 8000");
  try {
    db.exec("PRAGMA journal_mode = WAL");
  } catch {
    // якщо режим уже виставлений іншим процесом — не критично
  }
  db.exec("PRAGMA foreign_keys = ON");

  db.exec(SCHEMA);
  seedIfEmpty(db);
  return db;
}

function seedIfEmpty(db: DatabaseSync) {
  const row = db.prepare("SELECT COUNT(*) AS n FROM users").get() as unknown as { n: number };
  if (row.n > 0) return;

  const insert = db.prepare(`
    INSERT INTO users (name, telegram_username, role, position, can_create_tasks,
      can_edit_tasks, can_reorder_queue, can_upload_files, can_take_tasks,
      can_close_tasks, can_manage_team)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // власник — усі права
  insert.run("Світлана", null, "owner", "Директор", 1, 1, 1, 1, 1, 1, 1);
  // моделювання
  insert.run("Тарас", null, "modeler", "Моделювання", 1, 1, 0, 1, 0, 0, 0);
  // фрезерування
  insert.run("Володя", null, "miller", "Фрезерування", 0, 0, 0, 1, 1, 1, 0);
}

// Next перезавантажує модулі в dev і форкає воркери на білді — тримаємо
// одне з'єднання на процес і відкриваємо його ліниво, при першому запиті.
const globalForDb = globalThis as unknown as { __grainDb?: DatabaseSync };

function instance(): DatabaseSync {
  globalForDb.__grainDb ??= open();
  return globalForDb.__grainDb;
}

export const db: DatabaseSync = new Proxy({} as DatabaseSync, {
  get(_target, prop) {
    const real = instance() as unknown as Record<string | symbol, unknown>;
    const value = real[prop];
    return typeof value === "function" ? value.bind(real) : value;
  },
});

type Param = string | number | null | bigint | Uint8Array;

/**
 * node:sqlite типізує результат як Record<string, SQLOutputValue> і віддає рядки
 * з null-прототипом (такі React не передає в клієнтські компоненти). Тому
 * приведення типу і перетворення на звичайні обʼєкти робимо тут, в одному місці.
 */
export function queryAll<T>(sql: string, ...params: Param[]): T[] {
  return db.prepare(sql).all(...params).map((row) => ({ ...row })) as unknown as T[];
}

export function queryOne<T>(sql: string, ...params: Param[]): T | null {
  const row = db.prepare(sql).get(...params);
  return row ? ({ ...row } as unknown as T) : null;
}

export function count(sql: string, ...params: Param[]): number {
  return queryOne<{ n: number }>(sql, ...params)?.n ?? 0;
}
