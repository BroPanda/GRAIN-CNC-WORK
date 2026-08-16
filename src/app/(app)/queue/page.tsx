import Link from "next/link";
import { can, requireUser } from "@/lib/auth";
import { getStats, listMillers, listModelers, listTasks } from "@/lib/queries";
import type { TaskListItem } from "@/lib/types";
import TaskCard from "@/components/TaskCard";
import TaskActions from "@/components/TaskActions";
import { abilitiesFor } from "@/lib/abilities";
import { todayInKyiv } from "@/lib/format";
import QueueList from "@/components/QueueList";
import Section from "@/components/Section";
import { IconClock, IconPlus, IconRework } from "@/components/Icons";

type Filter = "all" | "mine" | "queued" | "in_progress" | "rework" | "overdue";

const FILTERS: readonly Filter[] = [
  "all",
  "mine",
  "queued",
  "in_progress",
  "rework",
  "overdue",
] as const;

const isFilter = (v: string | undefined): v is Filter =>
  !!v && (FILTERS as readonly string[]).includes(v);

/**
 * Протерміновано = термін уже минув. Строго менше: «термін сьогодні» ще не
 * прострочка, і бейдж на карточці каже те саме. Дата київська — так само, як
 * її рахують лічильник у getStats() і dueMeta().
 */
function isOverdue(task: TaskListItem): boolean {
  if (!task.due_date) return false;
  return task.due_date < todayInKyiv();
}

export default async function QueuePage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string }>;
}) {
  const me = await requireUser();
  const abilities = abilitiesFor(me);
  const { f } = await searchParams;
  const filter: Filter = isFilter(f) ? f : "all";

  // для моделювальника «моє» — це ще й те, що передали особисто йому
  const isMine = (t: TaskListItem) =>
    t.worker_id === me.id || t.assignee_id === me.id || t.rework_to === me.id;

  const apply = (tasks: TaskListItem[]) => {
    if (filter === "mine") return tasks.filter(isMine);
    if (filter === "overdue") return tasks.filter(isOverdue);
    return tasks;
  };

  /** Фільтр за станом ховає чужі секції цілком. */
  const showSection = (status: Filter) =>
    filter === "all" || filter === "mine" || filter === "overdue" || filter === status;

  const [inProgressAll, queuedAll, reworkAll, stats, modelers, millers] = await Promise.all([
    listTasks(me, ["in_progress"]),
    listTasks(me, ["queued"]),
    listTasks(me, ["rework"]),
    getStats(me),
    listModelers(),
    listMillers(),
  ]);
  const activeTotal = inProgressAll.length + queuedAll.length + reworkAll.length;
  const mineTotal = [...inProgressAll, ...queuedAll, ...reworkAll].filter(isMine).length;

  const inProgress = apply(inProgressAll);
  const queued = apply(queuedAll);
  const rework = apply(reworkAll);

  return (
    <div className="mx-auto w-full max-w-4xl">
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold">Черга робіт</h1>
          <p className="text-sm text-ink-muted">
            {me.role === "miller"
              ? "Беріть верхню задачу, а якщо вона поки не на часі — прокрутіть нижче"
              : "Перетягуйте задачі, щоб змінити пріоритет виконання"}
          </p>
        </div>
        {can(me, "can_create_tasks") && (
          <Link href="/tasks/new" className="btn btn-primary hidden lg:inline-flex">
            <IconPlus className="h-5 w-5" />
            Нова задача
          </Link>
        )}
      </header>

      {/* Зведення воно ж фільтр: цифра й дія в одному місці, тож не треба
          двох рядів кнопок. Останню картку не фільтруємо — здані роботи
          живуть у статистиці */}
      <div className="mb-5 grid grid-cols-3 gap-2 sm:grid-cols-6">
        <Stat filter="all" active={filter} label="Усі" value={activeTotal} />
        <Stat filter="mine" active={filter} label="Мої" value={mineTotal} />
        <Stat filter="queued" active={filter} label="У черзі" value={stats.queued} />
        <Stat filter="in_progress" active={filter} label="В роботі" value={stats.in_progress} tone="info" />
        <Stat filter="rework" active={filter} label="Доопрацювання" value={stats.rework} tone="warn" />
        <Stat filter="overdue" active={filter} label="Протерміновано" value={stats.overdue} tone="danger" />
      </div>

      {showSection("in_progress") && inProgress.length > 0 && (
        <Section
          id="in-progress"
          title="В роботі зараз"
          icon={<IconClock className="h-4 w-4" />}
          count={inProgress.length}
        >
          <div className="flex flex-col gap-2.5">
            {inProgress.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                actions={
                  <TaskActions
                    task={task}
                    me={me}
                    abilities={abilities}
                    modelers={modelers}
                    millers={millers}
                    compact
                  />
                }
              />
            ))}
          </div>
        </Section>
      )}

      {showSection("queued") && (
      <Section id="queued" title="У черзі" count={queued.length}>
        <QueueList
          tasks={queued}
          me={me}
          abilities={abilities}
          modelers={modelers}
          millers={millers}
        />
      </Section>
      )}

      {showSection("rework") && rework.length > 0 && (
        <Section
          id="rework"
          title="На доопрацюванні"
          icon={<IconRework className="h-4 w-4" />}
          count={rework.length}
          hint="Чекають на виправлення моделі — у роботу не беруться, поки не повернуті в чергу"
        >
          <div className="flex flex-col gap-2.5">
            {rework.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                actions={
                  <TaskActions
                    task={task}
                    me={me}
                    abilities={abilities}
                    modelers={modelers}
                    millers={millers}
                    compact
                  />
                }
              />
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

/** Картка зведення, вона ж кнопка фільтра. */
function Stat({
  filter,
  active,
  label,
  value,
  tone = "muted",
}: {
  filter: Filter;
  active: Filter;
  label: string;
  value: number;
  tone?: "muted" | "info" | "warn" | "danger";
}) {
  const tones = {
    muted: "text-ink",
    info: "text-info",
    warn: "text-warn",
    danger: value > 0 ? "text-danger" : "text-ink-dim",
  } as const;
  const on = active === filter;
  return (
    <Link
      href={filter === "all" ? "/queue" : `/queue?f=${filter}`}
      aria-current={on ? "page" : undefined}
      className={`card px-3 py-2.5 transition ${
        on ? "border-gold-500/60 bg-gold-500/10" : "hover:border-white/20"
      }`}
    >
      <div className={`text-xl font-bold ${on ? "text-gold-300" : tones[tone]}`}>{value}</div>
      <div className="truncate text-[11px] text-ink-dim uppercase">{label}</div>
    </Link>
  );
}
