"use client";

/**
 * Екран налаштувань сповіщень, зроблений як у Telegram: секції зі списками
 * рядків, у кожному рядку тумблер. Звук живе в браузері (у цеху й удома в
 * однієї людини різні побажання), а дублювання в бот — у базі, бо бот пише
 * людині, а не вкладці.
 */

import { useRouter } from "next/navigation";
import {
  NOTIF_GROUPS,
  NOTIF_GROUP_ICON,
  NOTIF_GROUP_LABELS,
  type NotifBucket,
  type NotifGroup,
} from "@/lib/notif-groups";
import { setTelegramNotify, setTelegramSelf } from "@/lib/actions";
import { useAction } from "./useAction";
import { useSoundSettings } from "./useSoundSettings";
import { playNotifSound, primeAudio } from "./notifySound";
import { IconTelegram } from "./Icons";

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

function Switch({
  on,
  disabled,
  onChange,
  label,
}: {
  on: boolean;
  disabled?: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-40 ${
        on ? "bg-gold-500" : "bg-white/15"
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
          on ? "left-[1.375rem]" : "left-0.5"
        }`}
      />
    </button>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-5">
      <h2 className="mb-1.5 px-1 text-xs font-bold tracking-wide text-ink-dim uppercase">
        {title}
      </h2>
      <div className="card divide-y divide-white/8 overflow-hidden">{children}</div>
      {hint && <p className="mt-1.5 px-1 text-xs text-ink-dim">{hint}</p>}
    </section>
  );
}

function Row({
  icon,
  title,
  note,
  children,
}: {
  icon?: React.ReactNode;
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 px-3.5 py-2.5">
      {icon && <span className="w-5 shrink-0 text-center">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{title}</span>
        {note && <span className="block text-xs text-ink-dim">{note}</span>}
      </span>
      {children}
    </div>
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

  const toggleSound = (bucket: NotifBucket) => {
    const willHear = sound.isMuted(bucket);
    sound.toggleBucket(bucket);
    if (willHear) {
      primeAudio();
      playNotifSound(bucket); // одразу чути, який саме сигнал увімкнули
    }
  };

  return (
    <>
      {error && (
        <p className="mb-3 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">
          {error}
        </p>
      )}

      <Section
        title="Звук у застосунку"
        hint="Налаштування браузера: на телефоні й на комп'ютері воно своє."
      >
        <Row title="Звук сповіщень" note={sound.master ? "вимкнено" : "увімкнено"}>
          <Switch
            on={sound.ready && !sound.master}
            label="Звук сповіщень"
            onChange={() => {
              const willHear = sound.master;
              sound.toggleMaster();
              if (willHear) {
                primeAudio();
                playNotifSound("comment");
              }
            }}
          />
        </Row>
        {buckets.map((bucket) => (
          <Row
            key={bucket}
            icon={NOTIF_GROUP_ICON[bucket]}
            title={NOTIF_GROUP_LABELS[bucket]}
          >
            <Switch
              on={sound.ready && !sound.master && !sound.isMuted(bucket)}
              disabled={sound.master}
              label={`Звук: ${NOTIF_GROUP_LABELS[bucket]}`}
              onChange={() => toggleSound(bucket)}
            />
          </Row>
        ))}
      </Section>

      <Section
        title="Дублювати в Telegram"
        hint={
          botOn && linked
            ? "Бот надсилає особисто вам, окрім ваших власних дій."
            : undefined
        }
      >
        {!botOn ? (
          <Row title="Бота не підключено" note="Дублювати нікуди" >
            <IconTelegram className="h-5 w-5 text-ink-dim" />
          </Row>
        ) : !linked ? (
          <Row title="Спершу увійдіть через бота" note="Інакше йому нікуди писати">
            <IconTelegram className="h-5 w-5 text-ink-dim" />
          </Row>
        ) : (
          <>
            <Row title="Усі категорії">
              <Switch
                on={tgOn("all")}
                disabled={pending}
                label="Дублювати всі категорії"
                onChange={() => toggleTg("all")}
              />
            </Row>
            {buckets.map((bucket) => (
              <Row
                key={bucket}
                icon={NOTIF_GROUP_ICON[bucket]}
                title={NOTIF_GROUP_LABELS[bucket]}
              >
                <Switch
                  on={tgOn(bucket)}
                  disabled={pending}
                  label={`У Telegram: ${NOTIF_GROUP_LABELS[bucket]}`}
                  onChange={() => toggleTg(bucket)}
                />
              </Row>
            ))}
            <Row
              title="Мої власні дії"
              note="Повний журнал: видно навіть те, що зробили ви самі"
            >
              <Switch
                on={self}
                disabled={pending}
                label="Надсилати й мої власні дії"
                onChange={() => run(() => setTelegramSelf(!self), () => router.refresh())}
              />
            </Row>
          </>
        )}
      </Section>
    </>
  );
}
