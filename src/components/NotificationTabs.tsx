"use client";

import Link from "next/link";
import {
  NOTIF_GROUPS,
  NOTIF_GROUP_LABELS,
  NOTIF_GROUP_SHORT,
  type NotifBucket,
  type NotifGroup,
} from "@/lib/notif-groups";
import { IconBell, IconBellOff } from "./Icons";
import { playNotifSound, primeAudio } from "./notifySound";
import { useSoundSettings } from "./useSoundSettings";

interface Props {
  active: NotifGroup;
  counts: Record<NotifGroup, number>;
}

/**
 * Вкладки з лічильниками непрочитаних і власним вимикачем звуку на кожній.
 * Перекреслений дзвіночок = звук цієї категорії вимкнено; «Всі» вимикає звук
 * геть усюди. На телефоні вкладки прокручуються вбік, на ПК переносяться.
 */
export default function NotificationTabs({ active, counts }: Props) {
  const sound = useSoundSettings();

  const toggle = (group: NotifGroup) => {
    if (group === "all") {
      const willMute = !sound.master;
      sound.toggleMaster();
      if (!willMute) {
        primeAudio();
        playNotifSound("comment"); // вмикаємо — одразу чути, що звук є
      }
      return;
    }

    const bucket = group as NotifBucket;
    const willMute = !sound.isMuted(bucket);
    sound.toggleBucket(bucket);
    if (!willMute) {
      primeAudio();
      playNotifSound(bucket); // чути саме той сигнал, що ввімкнули
    }
  };

  const mutedFor = (group: NotifGroup) =>
    group === "all" ? sound.master : sound.isMuted(group as NotifBucket);

  return (
    <nav className="-mx-4 mb-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:overflow-visible sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <ul className="flex w-max gap-1.5 sm:w-auto sm:flex-wrap">
        {NOTIF_GROUPS.map((group) => {
          const on = group === active;
          const n = counts[group];
          const muted = sound.ready && mutedFor(group);

          return (
            <li key={group}>
              <div
                className={`flex items-stretch overflow-hidden rounded-xl border transition ${
                  on
                    ? "border-gold-500/60 bg-gold-500/15 text-gold-300"
                    : "border-white/10 bg-white/[0.03] text-ink-muted"
                }`}
              >
                <Link
                  href={group === "all" ? "/notifications" : `/notifications?tab=${group}`}
                  aria-current={on ? "page" : undefined}
                  className="flex items-center gap-1.5 py-2 pl-3 text-sm font-semibold whitespace-nowrap hover:text-ink"
                >
                  <span className="sm:hidden">{NOTIF_GROUP_SHORT[group]}</span>
                  <span className="hidden sm:inline">{NOTIF_GROUP_LABELS[group]}</span>
                  {n > 0 && (
                    <span className="grid h-5 min-w-5 place-items-center rounded-full bg-gold-500 px-1 text-[11px] font-bold text-navy-950">
                      {n}
                    </span>
                  )}
                </Link>

                <button
                  type="button"
                  onClick={() => toggle(group)}
                  aria-pressed={muted}
                  title={
                    group === "all"
                      ? muted
                        ? "Увімкнути звук усіх сповіщень"
                        : "Вимкнути звук усіх сповіщень"
                      : muted
                        ? `Увімкнути звук: ${NOTIF_GROUP_LABELS[group]}`
                        : `Вимкнути звук: ${NOTIF_GROUP_LABELS[group]}`
                  }
                  aria-label={
                    muted
                      ? `Увімкнути звук: ${NOTIF_GROUP_LABELS[group]}`
                      : `Вимкнути звук: ${NOTIF_GROUP_LABELS[group]}`
                  }
                  className={`px-2 transition hover:bg-white/10 ${
                    muted ? "text-danger" : "text-ink-dim/50 hover:text-ink"
                  }`}
                >
                  {muted ? (
                    <IconBellOff className="h-4 w-4" />
                  ) : (
                    <IconBell className="h-4 w-4 opacity-55" />
                  )}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
