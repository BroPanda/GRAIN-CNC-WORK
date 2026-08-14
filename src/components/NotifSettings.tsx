"use client";

/**
 * Налаштування сповіщень: два блоки з кнопками-таблетками — звук у браузері
 * і дублювання в Telegram. Натиснута кнопка = категорія ввімкнена.
 *
 * Звук живе в localStorage (у цеху й удома в однієї людини різні побажання),
 * а вибір категорій для бота — у базі, бо бот пише людині, а не вкладці.
 */

import { useRouter } from "next/navigation";
import {
  NOTIF_GROUPS,
  NOTIF_GROUP_LABELS,
  type NotifBucket,
  type NotifGroup,
} from "@/lib/notif-groups";
import { setTelegramNotify, setTelegramSelf } from "@/lib/actions";
import { useAction } from "./useAction";
import { useSoundSettings } from "./useSoundSettings";
import { playNotifSound, primeAudio } from "./notifySound";
import { IconBell, IconTelegram } from "./Icons";

interface Props {
  /** Категорії, які зараз ідуть у Telegram. */
  enabled: string[];
  /** Чи людина заходила через бота: без цього писати нікуди. */
  linked: boolean;
  /** Чи слати в бот і власні дії. */
  self: boolean;
  /** Чи підключений бот узагалі. */
  botOn: boolean;
}

function Pill({
  on,
  disabled,
  onClick,
  children,
  tone,
}: {
  on: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tone: "gold" | "info";
}) {
  const active =
    tone === "gold"
      ? "border-gold-500/60 bg-gold-500/15 text-gold-300"
      : "border-info/50 bg-info/15 text-info";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-xl border px-3 py-1.5 text-sm font-semibold transition disabled:opacity-40 ${
        on ? active : "border-white/10 text-ink-muted hover:border-white/20"
      }`}
    >
      {children}
    </button>
  );
}

function Block({
  icon,
  title,
  hint,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card mb-4 p-3.5">
      <div className="mb-2 flex items-center gap-2">
        {icon}
        <h2 className="text-sm font-bold">{title}</h2>
      </div>
      {hint && <p className="mb-2.5 text-xs text-ink-dim">{hint}</p>}
      {children}
    </section>
  );
}

export default function NotifSettings({ enabled, linked, self, botOn }: Props) {
  const router = useRouter();
  const { run, pending, error } = useAction();
  const sound = useSoundSettings();

  const buckets = NOTIF_GROUPS.filter((g): g is NotifBucket => g !== "all");

  const tgOn = (group: NotifGroup) =>
    group === "all" ? buckets.every((b) => enabled.includes(b)) : enabled.includes(group);
  const toggleTg = (group: NotifGroup) =>
    run(() => setTelegramNotify(group, !tgOn(group)), () => router.refresh());

  const soundOn = (group: NotifGroup) =>
    sound.ready && (group === "all" ? !sound.master : !sound.master && !sound.isMuted(group));

  const toggleSound = (group: NotifGroup) => {
    const willHear = !soundOn(group);
    if (group === "all") {
      sound.toggleMaster();
    } else {
      // глушник «усіх» переважує окремі категорії — знімаємо і його
      if (sound.master) sound.toggleMaster();
      if (!willHear || sound.isMuted(group as NotifBucket)) {
        sound.toggleBucket(group as NotifBucket);
      }
    }
    if (willHear) {
      primeAudio();
      playNotifSound(group === "all" ? "comment" : (group as NotifBucket));
    }
  };

  return (
    <>
      {error && (
        <p className="mb-3 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">
          {error}
        </p>
      )}

      <Block
        icon={<IconBell className="h-4 w-4 text-gold-400" />}
        title="Звук у застосунку"
        hint="Чутно, поки відкритий сайт. Налаштування браузера: на телефоні й на комп'ютері воно своє."
      >
        <ul className="flex flex-wrap gap-1.5">
          {NOTIF_GROUPS.map((group) => (
            <li key={group}>
              <Pill tone="gold" on={soundOn(group)} onClick={() => toggleSound(group)}>
                {NOTIF_GROUP_LABELS[group]}
              </Pill>
            </li>
          ))}
        </ul>
      </Block>

      <Block
        icon={<IconTelegram className="h-4 w-4 text-info" />}
        title="Дублювати в Telegram"
        hint={
          botOn && linked
            ? "Обрані категорії бот надсилатиме особисто вам, окрім ваших власних дій."
            : undefined
        }
      >
        {!botOn ? (
          <p className="text-sm text-ink-muted">Бота не підключено — дублювати нікуди.</p>
        ) : !linked ? (
          <p className="text-sm text-ink-muted">
            Спершу увійдіть через бота — інакше йому нікуди писати.
          </p>
        ) : (
          <>
            <ul className="flex flex-wrap gap-1.5">
              {NOTIF_GROUPS.map((group) => (
                <li key={group}>
                  <Pill
                    tone="info"
                    on={tgOn(group)}
                    disabled={pending}
                    onClick={() => toggleTg(group)}
                  >
                    {NOTIF_GROUP_LABELS[group]}
                  </Pill>
                </li>
              ))}
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
      </Block>
    </>
  );
}
