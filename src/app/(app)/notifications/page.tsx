import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listNotifications, unreadCount } from "@/lib/queries";
import { readAllNotifications } from "@/lib/actions";
import { relativeTime } from "@/lib/format";
import { IconBell } from "@/components/Icons";

const TYPE_TONE: Record<string, string> = {
  rework: "border-l-warn",
  done: "border-l-ok",
  cancelled: "border-l-danger",
  taken: "border-l-info",
  created: "border-l-gold-500",
  returned: "border-l-gold-500",
};

export default async function NotificationsPage() {
  const me = await requireUser();
  const items = await listNotifications(me.id);
  const unread = await unreadCount(me.id);

  return (
    <div className="mx-auto w-full max-w-2xl">
      <header className="mb-4 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold">Сповіщення</h1>
          <p className="text-sm text-ink-muted">
            {unread > 0 ? `${unread} непрочитаних` : "Все прочитано"}
          </p>
        </div>
        {unread > 0 && (
          <form
            action={async () => {
              "use server";
              await readAllNotifications();
            }}
          >
            <button type="submit" className="btn btn-ghost btn-sm">
              Прочитати всі
            </button>
          </form>
        )}
      </header>

      {!items.length && (
        <p className="card flex flex-col items-center gap-2 p-8 text-center text-sm text-ink-muted">
          <IconBell className="h-8 w-8 text-ink-dim" />
          Поки що подій немає.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {items.map((n) => {
          const body = (
            <div
              className={`card border-l-4 p-3.5 transition ${
                TYPE_TONE[n.type] ?? "border-l-white/15"
              } ${n.read_at ? "opacity-65" : ""}`}
            >
              <div className="flex items-start gap-2">
                <p className="min-w-0 flex-1 text-sm">
                  {!n.read_at && (
                    <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-gold-500 align-middle" />
                  )}
                  {n.text}
                </p>
                <span className="shrink-0 text-[11px] whitespace-nowrap text-ink-dim">
                  {relativeTime(n.created_at)}
                </span>
              </div>
              {n.task_code && (
                <div className="mt-1 font-mono text-xs text-ink-dim">{n.task_code}</div>
              )}
            </div>
          );

          return (
            <li key={n.id}>
              {n.task_id ? <Link href={`/tasks/${n.task_id}`}>{body}</Link> : body}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
