import Link from "next/link";
import { can, requireUser } from "@/lib/auth";
import { getStats, listTasks } from "@/lib/queries";
import type { TaskListItem } from "@/lib/types";
import TaskCard from "@/components/TaskCard";
import TaskActions from "@/components/TaskActions";
import { abilitiesFor } from "@/lib/abilities";
import QueueList from "@/components/QueueList";
import Section from "@/components/Section";
import { IconClock, IconPlus, IconRework } from "@/components/Icons";

type Filter = "all" | "mine" | "hot";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Усі" },
  { key: "mine", label: "Мої" },
  { key: "hot", label: "Гарячі" },
];

function isOverdue(task: TaskListItem): boolean {
  if (!task.due_date) return false;
  const today = new Date().toISOString().slice(0, 10);
  return task.due_date <= today;
}

export default async function QueuePage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string }>;
}) {
  const me = await requireUser();
  const abilities = abilitiesFor(me);
  const { f } = await searchParams;
  const filter: Filter = f === "mine" || f === "hot" ? f : "all";

  const apply = (tasks: TaskListItem[]) => {
    if (filter === "mine") {
      return tasks.filter((t) => t.worker_id === me.id || t.assignee_id === me.id);
    }
    if (filter === "hot") {
      return tasks.filter((t) => t.priority === "urgent" || isOverdue(t));
    }
    return tasks;
  };

  const [inProgressAll, queuedAll, reworkAll, stats] = await Promise.all([
    listTasks(me, ["in_progress"]),
    listTasks(me, ["queued"]),
    listTasks(me, ["rework"]),
    getStats(me),
  ]);
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

      {/* Зведення */}
      <div className="no-scrollbar mb-4 flex gap-2 overflow-x-auto pb-1">
        <Stat label="У черзі" value={stats.queued} />
        <Stat label="В роботі" value={stats.in_progress} tone="info" />
        <Stat label="Доопрацювання" value={stats.rework} tone="warn" />
        <Stat label="Прострочено" value={stats.overdue} tone="danger" />
        <Stat label="Готово за тиждень" value={stats.done_week} tone="ok" />
      </div>

      {/* Фільтри */}
      <div className="mb-5 inline-flex rounded-xl border border-white/10 bg-white/[0.03] p-1">
        {FILTERS.map((item) => (
          <Link
            key={item.key}
            href={item.key === "all" ? "/queue" : `/queue?f=${item.key}`}
            className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition ${
              filter === item.key ? "bg-gold-500 text-navy-950" : "text-ink-muted hover:text-ink"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </div>

      {inProgress.length > 0 && (
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
                actions={<TaskActions task={task} me={me} abilities={abilities} compact />}
              />
            ))}
          </div>
        </Section>
      )}

      <Section id="queued" title="У черзі" count={queued.length}>
        <QueueList tasks={queued} me={me} abilities={abilities} />
      </Section>

      {rework.length > 0 && (
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
                actions={<TaskActions task={task} me={me} abilities={abilities} compact />}
              />
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: number;
  tone?: "muted" | "info" | "warn" | "danger" | "ok";
}) {
  const tones = {
    muted: "text-ink",
    info: "text-info",
    warn: "text-warn",
    danger: value > 0 ? "text-danger" : "text-ink-dim",
    ok: "text-ok",
  } as const;
  return (
    <div className="card shrink-0 px-3.5 py-2.5">
      <div className={`text-xl font-bold ${tones[tone]}`}>{value}</div>
      <div className="text-[11px] whitespace-nowrap text-ink-dim uppercase">{label}</div>
    </div>
  );
}
