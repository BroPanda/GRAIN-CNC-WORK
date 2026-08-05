import Image from "next/image";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listActiveUsers } from "@/lib/queries";
import { loginAs } from "@/lib/actions";
import { PERMISSION_KEYS, ROLE_LABELS } from "@/lib/types";
import { IconTelegram } from "@/components/Icons";

const ROLE_ORDER = ["owner", "modeler", "miller"] as const;

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/queue");
  const users = listActiveUsers();

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-4 py-10">
      <div className="mb-7 flex flex-col items-center text-center">
        <Image
          src="/grain-logo.jpg"
          alt="GRAIN"
          width={92}
          height={92}
          className="rounded-2xl shadow-lg shadow-black/40"
          priority
        />
        <h1 className="mt-4 text-2xl font-bold">Задачник ЧПУ</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Черга робіт фрезерування · рекламна компанія GRAIN
        </p>
      </div>

      <div className="card p-4">
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-info/25 bg-info/10 p-3 text-sm text-ink-muted">
          <IconTelegram className="mt-0.5 h-5 w-5 shrink-0 text-info" />
          <p>
            <span className="font-semibold text-ink">Тестовий режим.</span> Вхід через Telegram
            підключається перед продакшеном — поки що просто виберіть, ким зайти, щоб перевірити
            роботу з різних ролей.
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
                            {u.position ?? ROLE_LABELS[u.role]}
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
    </div>
  );
}
