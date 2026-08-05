import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { unreadCount } from "@/lib/queries";

/**
 * Найсвіжіше сповіщення користувача + лічильник непрочитаних.
 * Браузер опитує це раз на 15 с, щоб дзенькнути й оновити значок на дзвіночку.
 */
export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ id: 0, type: null, unread: 0 });

  const [latest, unread] = await Promise.all([
    queryOne<{ id: number; type: string }>(
      "SELECT id, type FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT ?",
      user.id,
      1
    ),
    unreadCount(user.id),
  ]);

  return NextResponse.json(
    { id: latest?.id ?? 0, type: latest?.type ?? null, unread },
    { headers: { "Cache-Control": "no-store" } }
  );
}
