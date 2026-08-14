import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listActiveUsers } from "@/lib/queries";
import { loginAs } from "@/lib/actions";
import { botConfigured, botUsername } from "@/lib/telegram";
import { PERMISSION_KEYS, ROLE_LABELS } from "@/lib/types";
import { IconTelegram } from "@/components/Icons";
import { LogoMark } from "@/components/Logo";

const ROLE_ORDER = ["owner", "modeler", "miller"] as const;

const ERRORS: Record<string, string> = {
  token: "Посилання вже використане або застаріле. Візьміть у боті нове.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await getCurrentUser()) redirect("/queue");

  const { error } = await searchParams;
  const message = error ? ERRORS[error] : null;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-4 py-10">
      <div className="mb-7 flex flex-col items-center text-center">
        <LogoMark size={92} className="drop-shadow-lg" />
        <div className="mt-4 text-3xl font-bold tracking-wide">
          <span style={{ color: "#1b93cf" }}>FREZA</span>
          <span className="text-ink-muted">LVIV</span>
        </div>
        <h1 className="mt-1 text-lg font-semibold text-ink-muted">Задачник ЧПУ</h1>
        <p className="mt-1 text-sm text-ink-dim">Черга робіт фрезерування</p>
      </div>

      {message && (
        <p className="mb-3 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">
          {message}
        </p>
      )}

      {botConfigured() ? <TelegramLogin /> : <DevLogin />}
    </div>
  );
}

/** Робочий вхід: бот перевіряє номер телефону і присилає посилання. */
function TelegramLogin() {
  const bot = botUsername();

  return (
    <div className="card p-5">
      <a
        href={`https://t.me/${bot}?start=login`}
        className="btn btn-primary w-full justify-center py-3 text-base"
      >
        <IconTelegram className="h-5 w-5" />
        Увійти через Telegram
      </a>

      <ol className="mt-5 flex flex-col gap-3 text-sm text-ink-muted">
        {[
          "Відкриється наш бот у Telegram — натисніть «Запустити».",
          "Натисніть кнопку «Поділитися номером» — Telegram підставить ваш номер сам.",
          "У відповідь прийде посилання для входу. Воно діє 15 хвилин.",
        ].map((step, i) => (
          <li key={i} className="flex gap-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gold-500/20 text-xs font-bold text-gold-300">
              {i + 1}
            </span>
            <span className="min-w-0 flex-1">{step}</span>
          </li>
        ))}
      </ol>

      <p className="mt-5 border-t border-white/8 pt-4 text-xs text-ink-dim">
        Заходити можуть лише ті, чий номер керівництво додало в розділі «Команда». Якщо бот
        відповідає, що номера немає — зверніться до керівництва.
      </p>
    </div>
  );
}

/**
 * Запасний вхід для локальної розробки й автотестів: поки бот не налаштований
 * (немає TELEGRAM_BOT_TOKEN), заходимо просто вибором співробітника зі списку.
 * На проді з підключеним ботом цей блок не показується, а сама дія блокується.
 */
async function DevLogin() {
  const users = await listActiveUsers();

  return (
    <div className="card p-4">
      <div className="mb-4 flex items-start gap-3 rounded-xl border border-info/25 bg-info/10 p-3 text-sm text-ink-muted">
        <IconTelegram className="mt-0.5 h-5 w-5 shrink-0 text-info" />
        <p>
          <span className="font-semibold text-ink">Тестовий режим.</span> Бот Telegram ще не
          підключений (немає <code>TELEGRAM_BOT_TOKEN</code>) — поки що просто виберіть, ким
          зайти, щоб перевірити роботу з різних ролей.
        </p>
      </div>

      {ROLE_ORDER.map((role) => {
        const group = users.filter((u) => u.role === role);
        if (!group.length) return null;
        return (
          <div key={role} className="mb-4 last:mb-0">
            <div className="label">{ROLE_LABELS[role]}</div>
            <div className="flex flex-col gap-2">
              {group.map((u) => {
                const grants =
                  u.role === "owner"
                    ? PERMISSION_KEYS.length
                    : PERMISSION_KEYS.filter((k) => u[k] === 1).length;
                return (
                  <form
                    key={u.id}
                    action={async () => {
                      "use server";
                      await loginAs(u.id);
                    }}
                  >
                    <button
                      type="submit"
                      className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3 text-left transition hover:border-gold-500/50 hover:bg-gold-500/10 active:scale-[0.99]"
                    >
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gold-500/20 font-bold text-gold-300">
                        {u.name.charAt(0)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{u.name}</span>
                        <span className="block truncate text-xs text-ink-dim">
                          {u.job_title ?? ROLE_LABELS[u.role]}
                          {u.telegram_username ? ` · @${u.telegram_username}` : ""}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-ink-dim">
                        {grants}/{PERMISSION_KEYS.length} прав
                      </span>
                    </button>
                  </form>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
