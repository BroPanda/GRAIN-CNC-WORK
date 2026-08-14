import { requireUser } from "@/lib/auth";
import { tgBuckets } from "@/lib/notif-groups";
import { botConfigured } from "@/lib/telegram";
import NotifViewTabs from "@/components/NotifViewTabs";
import NotifSettings from "@/components/NotifSettings";

export default async function NotificationSettingsPage() {
  const me = await requireUser();

  return (
    <div className="mx-auto w-full max-w-2xl">
      <header className="mb-4">
        <h1 className="text-2xl font-bold">Сповіщення</h1>
        <p className="text-sm text-ink-muted">Що і куди вам приходить</p>
      </header>

      <NotifViewTabs active="settings" />

      <NotifSettings
        enabled={tgBuckets(me.tg_buckets)}
        linked={me.telegram_id !== null}
        self={me.tg_self === 1}
        botOn={botConfigured()}
      />
    </div>
  );
}
