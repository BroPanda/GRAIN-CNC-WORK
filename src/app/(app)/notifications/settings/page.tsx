import { requireUser } from "@/lib/auth";
import { tgBuckets } from "@/lib/notif-groups";
import { botConfigured } from "@/lib/telegram";
import NotifViewTabs from "@/components/NotifViewTabs";
import TelegramNotify from "@/components/TelegramNotify";

export default async function NotificationSettingsPage() {
  const me = await requireUser();

  return (
    <div className="mx-auto w-full max-w-2xl">
      <header className="mb-4">
        <h1 className="text-2xl font-bold">Сповіщення</h1>
        <p className="text-sm text-ink-muted">Що і куди вам приходить</p>
      </header>

      <NotifViewTabs active="settings" />

      {botConfigured() ? (
        <TelegramNotify
          enabled={tgBuckets(me.tg_buckets)}
          linked={me.telegram_id !== null}
          self={me.tg_self === 1}
        />
      ) : (
        <p className="card p-6 text-center text-sm text-ink-muted">
          Бота не підключено, тож дублювати сповіщення нікуди.
        </p>
      )}

      <p className="mt-4 text-sm text-ink-dim">
        Звук налаштовується окремо, на вкладці «Сповіщення»: загальний вимикач
        угорі, а дзвіночок на кожній категорії глушить лише її. Ці налаштування
        живуть у браузері, тож на телефоні й на комп’ютері вони свої.
      </p>
    </div>
  );
}
