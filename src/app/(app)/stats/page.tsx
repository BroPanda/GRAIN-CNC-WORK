import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { doneByMonth, doneInRange, doneSummary, listDoneInRange } from "@/lib/queries";
import { formatExact, plural } from "@/lib/format";
import TaskCard from "@/components/TaskCard";

const MONTHS = [
  "січень", "лютий", "березень", "квітень", "травень", "червень",
  "липень", "серпень", "вересень", "жовтень", "листопад", "грудень",
];

function monthLabel(key: string): string {
  const [year, month] = key.split("-");
  return `${MONTHS[Number(month) - 1]} ${year}`;
}

/** Київська «сьогодні» — щоб форма за замовчуванням показувала поточний місяць. */
function kyivToday(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Kyiv" }));
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Дата рядком без переходу в UTC. Через toISOString() 1 серпня за київським
 * часом перетворюється на 31 липня — і місяць у підписах з'їжджає на один.
 */
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const monthKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const me = await requireUser();
  const params = await searchParams;

  const today = kyivToday();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const from = params.from || iso(monthStart);
  const to = params.to || iso(today);

  const [summary, months, range, tasks] = await Promise.all([
    doneSummary(me),
    doneByMonth(me),
    doneInRange(me, from, to),
    listDoneInRange(me, from, to),
  ]);

  const prevMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const cards: [string, number, string][] = [
    ["Сьогодні", summary.today, "з початку доби"],
    ["Цей тиждень", summary.week, "з понеділка"],
    ["Цей місяць", summary.month, monthLabel(monthKey(monthStart))],
    ["Минулий місяць", summary.prevMonth, monthLabel(monthKey(prevMonthStart))],
  ];

  const peak = Math.max(1, ...months.map((m) => m.n));
  const works = (n: number) => plural(n, ["робота", "роботи", "робіт"]);

  return (
    <div className="mx-auto w-full max-w-4xl">
      <h1 className="mb-1 text-2xl font-bold">Статистика</h1>
      <p className="mb-5 text-sm text-ink-muted">
        {me.role === "miller"
          ? "Ваші виконані роботи"
          : "Виконані роботи по цеху"}
      </p>

      {/* Швидкі цифри */}
      <div className="mb-6 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {cards.map(([label, value, hint]) => (
          <div key={label} className="card p-4">
            <div className="text-xs tracking-wide text-ink-dim uppercase">{label}</div>
            <div className="text-3xl font-bold text-gold-400">{value}</div>
            <div className="text-xs text-ink-dim">{hint}</div>
          </div>
        ))}
      </div>

      {/* Довільний період */}
      <section className="card mb-6 p-4">
        <h2 className="label">За період</h2>
        <form className="flex flex-wrap items-end gap-2">
          <div>
            <label className="label" htmlFor="from">Від</label>
            <input type="date" id="from" name="from" defaultValue={from} className="field" />
          </div>
          <div>
            <label className="label" htmlFor="to">До</label>
            <input type="date" id="to" name="to" defaultValue={to} className="field" />
          </div>
          <button type="submit" className="btn btn-ghost">Показати</button>
        </form>

        <p className="mt-4 text-sm">
          Виконано <span className="text-xl font-bold text-gold-400">{range.total}</span>{" "}
          {works(range.total)}
        </p>

        {range.byWorker.length > 1 && (
          <ul className="mt-2 flex flex-wrap gap-2">
            {range.byWorker.map((w) => (
              <li
                key={w.name ?? "—"}
                className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-sm"
              >
                {w.name ?? "без виконавця"}: <span className="font-bold">{w.n}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Помісячно */}
      <section className="card mb-6 p-4">
        <h2 className="label">По місяцях</h2>
        {!months.length ? (
          <p className="text-sm text-ink-muted">Виконаних робіт ще немає.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {months.map((m) => (
              <li key={m.month} className="flex items-center gap-3">
                <span className="w-32 shrink-0 text-sm text-ink-muted">
                  {monthLabel(m.month)}
                </span>
                <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/5">
                  <span
                    className="block h-full rounded-full bg-gold-500"
                    style={{ width: `${Math.round((m.n / peak) * 100)}%` }}
                  />
                </span>
                <span className="w-8 shrink-0 text-right text-sm font-bold">{m.n}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Що саме здали за вибраний період */}
      <section>
        <h2 className="label mb-2">
          Роботи за період{" "}
          <span className="font-normal text-ink-dim">
            {tasks.length ? `· ${tasks.length}` : ""}
          </span>
        </h2>
        {!tasks.length ? (
          <p className="card p-6 text-center text-sm text-ink-muted">
            За цей період нічого не здано.
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {tasks.map((task) => (
              <div key={task.id}>
                <TaskCard task={task} />
                {task.finished_at && (
                  <div className="mt-0.5 pl-1 font-mono text-[11px] text-ink-dim">
                    здано {formatExact(task.finished_at)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <p className="mt-6 text-center text-sm">
        <Link href="/archive" className="text-ink-muted hover:text-ink">
          Повний архів задач →
        </Link>
      </p>
    </div>
  );
}
