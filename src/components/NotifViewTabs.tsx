import Link from "next/link";

/**
 * Перемикач між стрічкою сповіщень і їхніми налаштуваннями. Раніше те й те
 * жило на одній сторінці, і блок налаштувань щоразу відсував саму стрічку.
 */
export default function NotifViewTabs({ active }: { active: "list" | "settings" }) {
  const tabs = [
    { key: "list", label: "Сповіщення", href: "/notifications" },
    { key: "settings", label: "Налаштування", href: "/notifications/settings" },
  ] as const;

  return (
    <div className="mb-4 inline-flex rounded-xl border border-white/10 bg-white/[0.03] p-1">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition ${
            active === tab.key ? "bg-gold-500 text-navy-950" : "text-ink-muted hover:text-ink"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
