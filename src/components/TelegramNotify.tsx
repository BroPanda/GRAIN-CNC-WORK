"use client";

/**
 * Вибір категорій, які дублюються в Telegram. На відміну від звуку (той живе
 * у localStorage браузера), це налаштування зберігається в базі — бот пише
 * людині, а не вкладці, тож пам'ятати має сервер.
 */

import { useRouter } from "next/navigation";
import { NOTIF_GROUPS, NOTIF_GROUP_LABELS, type NotifGroup } from "@/lib/notif-groups";
import { setTelegramNotify, setTelegramSelf } from "@/lib/actions";
import { useAction } from "./useAction";
import { IconTelegram } from "./Icons";

interface Props {
  /** Що зараз увімкнено — список категорій із профілю. */
  enabled: string[];
  /** Чи людина взагалі заходила через бота: без цього писати нікуди. */
  linked: boolean;
  /** Чи надсилати в бот і власні дії. */
  self: boolean;
}

export default function TelegramNotify({ enabled, linked, self }: Props) {
  const router = useRouter();
  const { run, pending, error } = useAction();

  const buckets = NOTIF_GROUPS.filter((g) => g !== "all");
  const on = (group: NotifGroup) =>
    group === "all" ? buckets.every((b) => enabled.includes(b)) : enabled.includes(group);

  const toggle = (group: NotifGroup) =>
    run(() => setTelegramNotify(group, !on(group)), () => router.refresh());

  return (
    <section className="card mb-4 p-3.5">
      <div className="mb-2.5 flex items-center gap-2">
        <IconTelegram className="h-4 w-4 text-info" />
        <h2 className="text-sm font-bold">Дублювати в Telegram</h2>
      </div>

      {!linked ? (
        <p className="text-sm text-ink-muted">
          Спершу увійдіть через бота — інакше йому нікуди писати.
        </p>
      ) : (
        <>
          <p className="mb-2.5 text-xs text-ink-dim">
            Обрані категорії бот надсилатиме особисто вам, окрім ваших власних дій.
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {NOTIF_GROUPS.map((group) => {
              const active = on(group);
              return (
                <li key={group}>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => toggle(group)}
                    aria-pressed={active}
                    className={`rounded-xl border px-3 py-1.5 text-sm font-semibold transition ${
                      active
                        ? "border-info/50 bg-info/15 text-info"
                        : "border-white/10 text-ink-muted hover:border-white/20"
                    }`}
                  >
                    {NOTIF_GROUP_LABELS[group]}
                  </button>
                </li>
              );
            })}
          </ul>

          <label className="mt-3 flex cursor-pointer items-center gap-2.5 border-t border-white/8 pt-3 text-sm">
            <input
              type="checkbox"
              className="h-5 w-5 accent-[#f2a825]"
              checked={self}
              disabled={pending}
              onChange={(e) =>
                run(() => setTelegramSelf(e.target.checked), () => router.refresh())
              }
            />
            <span>
              Надсилати й мої власні дії
              <span className="block text-xs text-ink-dim">
                Повний журнал у чаті: видно навіть те, що зробили ви самі.
              </span>
            </span>
          </label>
        </>
      )}

      {error && <p className="mt-2 text-sm font-semibold text-danger">{error}</p>}
    </section>
  );
}
