import { requireUser } from "@/lib/auth";
import { tgBuckets } from "@/lib/notif-groups";
import { botConfigured } from "@/lib/telegram";
import Link from "next/link";
import NotifSettings from "@/components/NotifSettings";

export default async function NotificationSettingsPage() {
  const me = await requireUser();

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Link
        href="/notifications"
        className="mb-3 inline-block text-sm text-ink-muted hover:text-ink"
      >
        ← До сповіщень
      </Link>
      <header className="mb-4">
        <h1 className="text-2xl font-bold">Налаштування сповіщень</h1>
        <p className="text-sm text-ink-muted">Що і куди вам приходить</p>
      </header>

      <NotifSettings
        enabled={tgBuckets(me.tg_buckets)}
        linked={me.telegram_id !== null}
        self={me.tg_self === 1}
        botOn={botConfigured()}
      />
    </div>
  );
}
