import { Pool, types } from "pg";

/**
 * Postgres: локально — вбудований сервер (`npm run pg`), на Vercel — Neon
 * через DATABASE_URL. Драйвер один і той самий, тому поведінка однакова.
 */

// timestamptz і date віддаємо як рядки: ISO для часу, YYYY-MM-DD для дати —
// далі їх форматує src/lib/format.ts, і жодних Date-об'єктів у клієнт не летить
types.setTypeParser(1114, (v) => new Date(`${v}Z`).toISOString()); // timestamp
types.setTypeParser(1184, (v) => new Date(v).toISOString()); // timestamptz
types.setTypeParser(1082, (v) => v); // date → "2026-08-12"
// numeric драйвер віддає рядком (щоб не втратити точність) — нам потрібне число
types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id                SERIAL PRIMARY KEY,
  name              TEXT    NOT NULL,
  telegram_username TEXT,
  role              TEXT    NOT NULL CHECK (role IN ('owner','modeler','miller')),
  job_title         TEXT,
  is_active         INTEGER NOT NULL DEFAULT 1,
  -- права (для власника ігноруються — він має все)
  can_create_tasks  INTEGER NOT NULL DEFAULT 0,
  can_edit_tasks    INTEGER NOT NULL DEFAULT 0,
  can_reorder_queue INTEGER NOT NULL DEFAULT 0,
  can_upload_files  INTEGER NOT NULL DEFAULT 0,
  can_take_tasks    INTEGER NOT NULL DEFAULT 0,
  can_close_tasks   INTEGER NOT NULL DEFAULT 0,
  can_manage_team   INTEGER NOT NULL DEFAULT 0,
  -- гроші: за замовчуванням не бачить ніхто, крім власника
  can_see_budget    INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tasks (
  id           SERIAL PRIMARY KEY,
  code         TEXT,
  title        TEXT    NOT NULL,
  description  TEXT    NOT NULL DEFAULT '',
  customer     TEXT    NOT NULL DEFAULT '',
  order_no     TEXT    NOT NULL DEFAULT '',
  material     TEXT    NOT NULL DEFAULT '',
  thickness_mm DOUBLE PRECISION,
  quantity     INTEGER NOT NULL DEFAULT 1,
  -- бюджет у гривнях; NULL = не вказано. Видно лише з правом can_see_budget
  budget_uah   NUMERIC(12,2),
  priority     TEXT    NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','urgent')),
  due_date     DATE,
  status       TEXT    NOT NULL DEFAULT 'queued'
               CHECK (status IN ('queued','in_progress','rework','done','cancelled')),
  -- NULL = задача у спільному пулі; інакше закріплена за фрезерувальником
  assignee_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  -- хто фізично виконує (проставляється при «Взяти в роботу»)
  worker_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  queue_pos    DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at   TIMESTAMPTZ,
  finished_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status, queue_pos);

CREATE TABLE IF NOT EXISTS task_files (
  id            SERIAL PRIMARY KEY,
  task_id       INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  kind          TEXT    NOT NULL CHECK (kind IN ('image','model','doc')),
  original_name TEXT    NOT NULL,
  -- локально: імʼя файлу на диску; у хмарі: URL у Blob-сховищі
  stored_name   TEXT    NOT NULL,
  ext           TEXT    NOT NULL,
  size_bytes    INTEGER NOT NULL DEFAULT 0,
  uploaded_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_files_task ON task_files(task_id);

CREATE TABLE IF NOT EXISTS task_events (
  id         SERIAL PRIMARY KEY,
  task_id    INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  actor_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  type       TEXT    NOT NULL,
  comment    TEXT    NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_task ON task_events(task_id, id);

CREATE TABLE IF NOT EXISTS notifications (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id    INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  actor_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  type       TEXT    NOT NULL,
  text       TEXT    NOT NULL,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read_at, id);
`;

/**
 * Оновлення для баз, створених раніше: SCHEMA вище застосовується лише коли
 * таблиць ще немає, тому нові колонки треба додавати окремо. Усі команди
 * безпечні для повторного запуску.
 */
const MIGRATIONS = `
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS budget_uah NUMERIC(12,2);
ALTER TABLE users ADD COLUMN IF NOT EXISTS can_see_budget INTEGER NOT NULL DEFAULT 0;
`;

/** Початкова команда GRAIN — створюється, якщо таблиця користувачів порожня. */
const SEED_TEAM = `
INSERT INTO users (name, role, job_title, can_create_tasks, can_edit_tasks,
  can_reorder_queue, can_upload_files, can_take_tasks, can_close_tasks, can_manage_team)
SELECT * FROM (VALUES
  ('Світлана', 'owner',   'Директор',     1, 1, 1, 1, 1, 1, 1),
  ('Тарас',    'modeler', 'Моделювання',  1, 1, 0, 1, 0, 0, 0),
  ('Володя',   'miller',  'Фрезерування', 0, 0, 0, 1, 1, 1, 0)
) AS seed
WHERE NOT EXISTS (SELECT 1 FROM users);
`;

function makePool(): Pool {
  const connectionString = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!connectionString) {
    throw new Error(
      "Не задано DATABASE_URL. Локально: `npm run pg` (підніме Postgres і запише .env.local)."
    );
  }
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(connectionString);
  return new Pool({
    connectionString,
    ssl: local ? undefined : { rejectUnauthorized: false },
    // на serverless кожен інстанс тримає власний пул — беремо мінімум зʼєднань
    max: process.env.VERCEL ? 1 : 5,
    idleTimeoutMillis: 30_000,
  });
}

// Next перезавантажує модулі в dev — тримаємо один пул на процес
const globalForDb = globalThis as unknown as {
  __grainPool?: Pool;
  __grainReady?: Promise<void>;
};

function pool(): Pool {
  globalForDb.__grainPool ??= makePool();
  return globalForDb.__grainPool;
}

/**
 * Створює схему й початкову команду. Викликається перед першим запитом,
 * один раз на процес. Advisory-lock захищає від гонки, коли кілька
 * інстансів піднімаються одночасно.
 */
function ensureSchema(): Promise<void> {
  globalForDb.__grainReady ??= (async () => {
    const client = await pool().connect();
    try {
      await client.query("SELECT pg_advisory_lock(727001)");
      try {
        await client.query(SCHEMA);
        await client.query(MIGRATIONS);
        await client.query(SEED_TEAM);
      } finally {
        await client.query("SELECT pg_advisory_unlock(727001)");
      }
    } finally {
      client.release();
    }
  })().catch((e) => {
    // не кешуємо провалену ініціалізацію, щоб наступний запит спробував знову
    globalForDb.__grainReady = undefined;
    throw e;
  });
  return globalForDb.__grainReady;
}

export type Param = string | number | boolean | null;

/** Наш SQL написаний з `?` — Postgres хоче $1, $2… */
function toPg(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

export async function queryAll<T>(sql: string, ...params: Param[]): Promise<T[]> {
  await ensureSchema();
  const res = await pool().query(toPg(sql), params);
  return res.rows as T[];
}

export async function queryOne<T>(sql: string, ...params: Param[]): Promise<T | null> {
  const rows = await queryAll<T>(sql, ...params);
  return rows[0] ?? null;
}

export async function run(sql: string, ...params: Param[]): Promise<void> {
  await ensureSchema();
  await pool().query(toPg(sql), params);
}

/** INSERT з поверненням id нового рядка. */
export async function insertReturningId(sql: string, ...params: Param[]): Promise<number> {
  const row = await queryOne<{ id: number }>(`${sql} RETURNING id`, ...params);
  if (!row) throw new Error("Не вдалося створити запис");
  return row.id;
}

export async function count(sql: string, ...params: Param[]): Promise<number> {
  const row = await queryOne<{ n: number }>(sql, ...params);
  return row?.n ?? 0;
}

/** Транзакція: усі запити всередині або застосуються, або відкатяться. */
export async function transaction(
  body: (exec: (sql: string, ...params: Param[]) => Promise<void>) => Promise<void>
): Promise<void> {
  await ensureSchema();
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    await body(async (sql, ...params) => {
      await client.query(toPg(sql), params);
    });
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
