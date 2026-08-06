import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { unreadCount } from "@/lib/queries";

/**
 * Сигнал «щось змінилось» для відкритих вкладок.
 *
 * Повертає дві речі:
 *  • version — відбиток стану задач: кількість, час останньої зміни та
 *    останні події й файли. Змінився рядок — значить, у цеху щось сталося,
 *    і сторінку треба перемалювати;
 *  • найсвіжіше сповіщення користувача — щоб дзенькнути потрібним звуком.
 *
 * Одним запитом, бо браузер смикає це раз на 15 секунд.
 */
export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ version: "", id: 0, type: null, unread: 0 });
  }

  const [state, latest, unread] = await Promise.all([
    queryOne<{ tasks_n: number; tasks_ts: string; events_id: number; files_id: number }>(
      `SELECT
         (SELECT COUNT(*)::int FROM tasks) AS tasks_n,
         (SELECT COALESCE(EXTRACT(EPOCH FROM MAX(updated_at))::bigint, 0) FROM tasks) AS tasks_ts,
         (SELECT COALESCE(MAX(id), 0) FROM task_events) AS events_id,
         (SELECT COALESCE(MAX(id), 0) FROM task_files) AS files_id`
    ),
    queryOne<{ id: number; type: string }>(
      "SELECT id, type FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT ?",
      user.id,
      1
    ),
    unreadCount(user.id),
  ]);

  const version = state
    ? `${state.tasks_n}-${state.tasks_ts}-${state.events_id}-${state.files_id}`
    : "";

  return NextResponse.json(
    { version, id: latest?.id ?? 0, type: latest?.type ?? null, unread },
    { headers: { "Cache-Control": "no-store" } }
  );
}
