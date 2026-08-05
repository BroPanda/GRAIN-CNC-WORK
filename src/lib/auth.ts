import { cookies } from "next/headers";
import { queryOne } from "./db";
import type { PermissionKey, User } from "./types";

export const SESSION_COOKIE = "grain_uid";

/**
 * ТИМЧАСОВА автентифікація для тестування.
 * Логін «через Telegram» поки що просто вибір користувача зі списку —
 * реальна перевірка initData/підпису Telegram підключається тут же,
 * коли проєкт піде на продакшен (див. README).
 */
export async function getCurrentUser(): Promise<User | null> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return null;

  return await queryOne<User>("SELECT * FROM users WHERE id = ? AND is_active = 1", id);
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Не авторизовано");
  return user;
}

/** Власник має всі права незалежно від перемикачів. */
export function can(user: User | null, key: PermissionKey): boolean {
  if (!user) return false;
  if (user.role === "owner") return true;
  return user[key] === 1;
}

export function assertCan(user: User, key: PermissionKey): void {
  if (!can(user, key)) throw new Error("Недостатньо прав для цієї дії");
}
