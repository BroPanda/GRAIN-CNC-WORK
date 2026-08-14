import { requireUser } from "@/lib/auth";
import { listNotifications, unreadByGroup } from "@/lib/queries";
import { readAllNotifications, readNotificationGroup } from "@/lib/actions";
import {
  NOTIF_GROUP_LABELS,
  type NotifGroup,
  isNotifGroup,
  tgBuckets,
} from "@/lib/notif-groups";
import { plural } from "@/lib/format";
import { IconBell } from "@/components/Icons";
import NotificationItem from "@/components/NotificationItem";
import NotificationTabs from "@/components/NotificationTabs";
import SoundToggle from "@/components/SoundToggle";
import TelegramNotify from "@/components/TelegramNotify";
import { botConfigured } from "@/lib/telegram";

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const me = await requireUser();
  const { tab } = await searchParams;
  const active: NotifGroup = isNotifGroup(tab) ? tab : "all";

  const [items, counts] = await Promise.all([
    listNotifications(me.id, active),
    unreadByGroup(me.id),
  ]);

  const unreadHere = counts[active];
  const unread = items.filter((n) => !n.read_at);
  const read = items.filter((n) => n.read_at);

  return (
    <div className="mx-auto w-full max-w-2xl">
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold">Сповіщення</h1>
          <p className="text-sm text-ink-muted">
            {counts.all > 0
              ? `${counts.all} ${plural(counts.all, [
                  "непрочитане",
                  "непрочитані",
                  "непрочитаних",
                ])}`
              : "Все прочитано"}
          </p>
        </div>
        <SoundToggle />
      </header>

      <NotificationTabs active={active} counts={counts} />

      {botConfigured() && (
        <TelegramNotify
          enabled={tgBuckets(me.tg_buckets)}
          linked={me.telegram_id !== null}
          self={me.tg_self === 1}
        />
      )}

      {unreadHere > 0 && (
        <form
          className="mb-3 flex justify-end"
          action={async () => {
            "use server";
            if (active === "all") await readAllNotifications();
            else await readNotificationGroup(active);
          }}
        >
          <button type="submit" className="btn btn-ghost btn-sm">
            {active === "all"
              ? `Прочитати всі (${unreadHere})`
              : `Прочитати «${NOTIF_GROUP_LABELS[active]}» (${unreadHere})`}
          </button>
        </form>
      )}

      {!items.length && (
        <p className="card flex flex-col items-center gap-2 p-8 text-center text-sm text-ink-muted">
          <IconBell className="h-8 w-8 text-ink-dim" />
          {active === "all" ? "Поки що подій немає." : "У цій вкладці порожньо."}
        </p>
      )}

      {/* Непрочитане завжди зверху окремим блоком — щоб нове не губилось */}
      {unread.length > 0 && (
        <section className="mb-6">
          <h2 className="label mb-2">Нові · {unread.length}</h2>
          <ul className="flex flex-col gap-2">
            {unread.map((item) => (
              <li key={item.id}>
                <NotificationItem item={item} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {read.length > 0 && (
        <section>
          <h2 className="label mb-2">Прочитані · {read.length}</h2>
          <ul className="flex flex-col gap-2">
            {read.map((item) => (
              <li key={item.id}>
                <NotificationItem item={item} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
