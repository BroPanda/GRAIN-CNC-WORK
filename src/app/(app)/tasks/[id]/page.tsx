import Link from "next/link";
import { notFound } from "next/navigation";
import { can, requireUser } from "@/lib/auth";
import {
  canSeeTask,
  getTask,
  getTaskEvents,
  getTaskFiles,
  listMillers,
} from "@/lib/queries";
import { ROLE_LABELS, STATUS_LABELS } from "@/lib/types";
import { EVENT_LABELS, type EventType } from "@/lib/notify";
import {
  PRIORITY_STYLE,
  STATUS_STYLE,
  dueMeta,
  formatDateTime,
  formatDueDate,
  formatMoney,
  relativeTime,
} from "@/lib/format";
import TaskActions from "@/components/TaskActions";
import { abilitiesFor } from "@/lib/abilities";
import { directUploadEnabled } from "@/lib/storage";
import TaskFiles from "@/components/TaskFiles";
import CommentBox from "@/components/CommentBox";
import AssigneeSelect from "@/components/AssigneeSelect";
import { IconEdit } from "@/components/Icons";

const DUE_TONE = {
  danger: "bg-danger/15 text-danger ring-1 ring-danger/30",
  warn: "bg-warn/15 text-warn ring-1 ring-warn/30",
  muted: "bg-white/8 text-ink-dim ring-1 ring-white/10",
} as const;

const EVENT_TONE: Record<string, string> = {
  rework: "border-warn/40 bg-warn/8",
  done: "border-ok/40 bg-ok/8",
  cancelled: "border-danger/40 bg-danger/8",
  taken: "border-info/40 bg-info/8",
  comment: "border-white/12 bg-white/[0.03]",
};

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const { id } = await params;
  const task = await getTask(me, Number(id));
  if (!task || !canSeeTask(me, task)) notFound();

  const abilities = abilitiesFor(me);
  const [files, events, millers] = await Promise.all([
    getTaskFiles(task.id),
    getTaskEvents(task.id),
    listMillers(),
  ]);
  const due = dueMeta(task.due_date);
  const canUpload = can(me, "can_upload_files");

  const specs: [string, string][] = [
    ["Матеріал", task.material || "—"],
    ["Товщина", task.thickness_mm ? `${task.thickness_mm} мм` : "—"],
    ["Кількість", `${task.quantity} шт`],
    ["Замовник", task.customer || "—"],
    ["№ замовлення", task.order_no || "—"],
    ["Термін", task.due_date ? formatDueDate(task.due_date) : "—"],
  ];

  // поля просто немає в даних, якщо права бачити бюджет немає
  if (task.budget_uah != null) {
    specs.push(["Бюджет", formatMoney(task.budget_uah)]);
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <Link href="/queue" className="mb-3 inline-block text-sm text-ink-muted hover:text-ink">
        ← До черги робіт
      </Link>

      {/* Заголовок */}
      <div className="card mb-4 p-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
              <span className={`chip ${STATUS_STYLE[task.status]}`}>
                {STATUS_LABELS[task.status]}
              </span>
              {task.priority === "urgent" && (
                <span className={`chip ${PRIORITY_STYLE.urgent}`}>Терміново</span>
              )}
              {due && <span className={`chip ${DUE_TONE[due.tone]}`}>{due.label}</span>}
              <span className="font-mono text-xs text-ink-dim">{task.code ?? `#${task.id}`}</span>
            </div>
            <h1 className="text-xl font-bold break-words sm:text-2xl">{task.title}</h1>
            <p className="mt-1 text-xs text-ink-dim">
              Створив {task.author_name ?? "—"} · {formatDateTime(task.created_at)}
              {task.worker_name ? ` · виконує ${task.worker_name}` : ""}
              {task.finished_at ? ` · закрито ${formatDateTime(task.finished_at)}` : ""}
            </p>
          </div>
          {abilities.edit && (
            <Link href={`/tasks/${task.id}/edit`} className="btn btn-ghost btn-sm">
              <IconEdit className="h-4 w-4" />
              Редагувати
            </Link>
          )}
        </div>

        {/* Дії */}
        <div className="mt-4 flex flex-wrap gap-2 border-t border-white/8 pt-4">
          <TaskActions task={task} me={me} abilities={abilities} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
        <div className="flex flex-col gap-4">
          {/* Опис */}
          <section className="card p-4">
            <h2 className="label">Опис і вимоги</h2>
            {task.description ? (
              <p className="text-sm whitespace-pre-wrap text-ink">{task.description}</p>
            ) : (
              <p className="text-sm text-ink-dim">Опис не заповнено.</p>
            )}
          </section>

          {/* Характеристики */}
          <section className="card p-4">
            <h2 className="label">Параметри</h2>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
              {specs.map(([key, value]) => (
                <div key={key}>
                  <dt className="text-[11px] tracking-wide text-ink-dim uppercase">{key}</dt>
                  <dd className="font-semibold break-words">{value}</dd>
                </div>
              ))}
            </dl>
            {abilities.edit && (
              <div className="mt-4 border-t border-white/8 pt-4">
                <AssigneeSelect
                  taskId={task.id}
                  assigneeId={task.assignee_id}
                  millers={millers}
                />
              </div>
            )}
          </section>

          {/* Файли */}
          <section className="card p-4">
            <h2 className="label">Матеріали задачі</h2>
            <TaskFiles
              taskId={task.id}
              files={files}
              canUpload={canUpload}
              directUpload={directUploadEnabled()}
            />
          </section>
        </div>

        {/* Історія */}
        <section className="card h-fit p-4">
          <h2 className="label">Історія та коментарі</h2>
          <CommentBox taskId={task.id} />

          <ol className="mt-4 flex flex-col gap-2.5">
            {events.map((event) => (
              <li
                key={event.id}
                className={`rounded-xl border px-3 py-2.5 ${
                  EVENT_TONE[event.type] ?? "border-white/8 bg-white/[0.02]"
                }`}
              >
                <div className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 text-sm font-semibold">
                    {EVENT_LABELS[event.type as EventType] ?? event.type}
                  </span>
                  <span className="shrink-0 text-[11px] text-ink-dim">
                    {relativeTime(event.created_at)}
                  </span>
                </div>
                <div className="text-xs text-ink-dim">
                  {event.actor_name ?? "—"}
                  {event.actor_role ? ` · ${ROLE_LABELS[event.actor_role]}` : ""}
                </div>
                {event.comment && (
                  <p className="mt-1.5 text-sm whitespace-pre-wrap text-ink">{event.comment}</p>
                )}
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
