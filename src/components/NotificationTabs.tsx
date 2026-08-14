import Link from "next/link";
import {
  NOTIF_GROUPS,
  NOTIF_GROUP_LABELS,
  NOTIF_GROUP_SHORT,
  type NotifGroup,
} from "@/lib/notif-groups";

interface Props {
  active: NotifGroup;
  counts: Record<NotifGroup, number>;
}

/**
 * Вкладки категорій із лічильниками непрочитаних. Звук налаштовується не тут,
 * а на вкладці «Налаштування»: у стрічці потрібні самі події, а не крутилки
 * до них. На телефоні вкладки прокручуються вбік, на ПК переносяться.
 */
export default function NotificationTabs({ active, counts }: Props) {
  return (
    <nav className="-mx-4 mb-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:overflow-visible sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <ul className="flex w-max gap-1.5 sm:w-auto sm:flex-wrap">
        {NOTIF_GROUPS.map((group) => {
          const on = group === active;
          const n = counts[group];

          return (
            <li key={group}>
              <Link
                href={group === "all" ? "/notifications" : `/notifications?tab=${group}`}
                aria-current={on ? "page" : undefined}
                className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold whitespace-nowrap transition ${
                  on
                    ? "border-gold-500/60 bg-gold-500/15 text-gold-300"
                    : "border-white/10 bg-white/[0.03] text-ink-muted hover:text-ink"
                }`}
              >
                <span className="sm:hidden">{NOTIF_GROUP_SHORT[group]}</span>
                <span className="hidden sm:inline">{NOTIF_GROUP_LABELS[group]}</span>
                {n > 0 && (
                  <span className="grid h-5 min-w-5 place-items-center rounded-full bg-gold-500 px-1 text-[11px] font-bold text-navy-950">
                    {n}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
