import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { queryOne, run } from "./db";
import type { PermissionKey, User } from "./types";

export const SESSION_COOKIE = "freza_uid";

const SESSION_DAYS = 30;

/**
 * Ключ для підпису сесії. На проді задається AUTH_SECRET (див. README);
 * якщо його немає — беремо токен бота, він теж секретний і теж є лише на сервері.
 * Локально, коли не задано нічого, працює запасний ключ: там і входу через
 * Telegram немає, вхід іде списком співробітників для тестування.
 */
function sessionSecret(): string {
  return process.env.AUTH_SECRET || process.env.TELEGRAM_BOT_TOKEN || "freza-local-dev-secret";
}

function sign(value: string): string {
  return createHmac("sha256", sessionSecret()).update(value).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** Значення cookie: `<id>.<підпис>` — підробити id без ключа не вийде. */
function readSessionCookie(raw: string): number | null {
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;
  const id = raw.slice(0, dot);
  if (!safeEqual(raw.slice(dot + 1), sign(id))) return null;
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function getCurrentUser(): Promise<User | null> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (!raw) return null;

  const id = readSessionCookie(raw);
  if (id === null) return null;

  return await queryOne<User>("SELECT * FROM users WHERE id = ? AND is_active = 1", id);
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Не авторизовано");
  return user;
}

/** Відкриває сесію. Можна викликати лише з server action або route handler. */
export async function startSession(userId: number): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, `${userId}.${sign(String(userId))}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * SESSION_DAYS,
  });
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/* ------------------------------------------- одноразові посилання для входу */

/** Скільки живе посилання, яке бот надсилає у відповідь на підтверджений номер. */
const LOGIN_TOKEN_MINUTES = 15;

export async function createLoginToken(userId: number): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await run(
    `INSERT INTO login_tokens (token, user_id, expires_at)
     VALUES (?, ?, now() + interval '${LOGIN_TOKEN_MINUTES} minutes')`,
    token,
    userId
  );
  return token;
}

/**
 * Перевіряє токен і одразу гасить його. Позначення використаним і перевірка
 * строку — одним запитом, щоб два переходи за тим самим посиланням не дали
 * двох сесій.
 */
export async function consumeLoginToken(token: string): Promise<number | null> {
  if (!token) return null;
  const row = await queryOne<{ user_id: number }>(
    `UPDATE login_tokens SET used_at = now()
      WHERE token = ? AND used_at IS NULL AND expires_at > now()
      RETURNING user_id`,
    token
  );
  if (!row) return null;

  // у неактивного співробітника посилання не спрацює, навіть якщо воно свіже
  const user = await queryOne<{ id: number }>(
    "SELECT id FROM users WHERE id = ? AND is_active = 1",
    row.user_id
  );
  return user ? user.id : null;
}

/* ----------------------------------------------------------------- права */

/** Власник має всі права незалежно від перемикачів. */
export function can(user: User | null, key: PermissionKey): boolean {
  if (!user) return false;
  if (user.role === "owner") return true;
  return user[key] === 1;
}

export function assertCan(user: User, key: PermissionKey): void {
  if (!can(user, key)) throw new Error("Недостатньо прав для цієї дії");
}
