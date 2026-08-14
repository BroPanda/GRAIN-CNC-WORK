import Link from "next/link";
import type { TaskListItem } from "@/lib/types";
import { STATUS_LABELS } from "@/lib/types";
import { PRIORITY_STYLE, STATUS_STYLE, dueMeta, formatMoney, specLine } from "@/lib/format";
import { IconCube, IconImage, IconPaperclip } from "@/components/Icons";

const DUE_TONE = {
  danger: "bg-danger/15 text-danger ring-1 ring-danger/30",
  warn: "bg-warn/15 text-warn ring-1 ring-warn/30",
  muted: "bg-white/8 text-ink-dim ring-1 ring-white/10",
} as const;

interface Props {
  task: TaskListItem;
  /** Номер у черзі (лише для активної черги). */
  index?: number;
  /** Слот під кнопки керування чергою / швидкі дії. */
  actions?: React.ReactNode;
}

export default function TaskCard({ task, index, actions }: Props) {
  const due = dueMeta(task.due_date);
  const closed = task.status === "done" || task.status === "cancelled";

  return (
    <article
      className={`card overflow-hidden transition ${
        task.priority === "urgent" && !closed ? "ring-1 ring-danger/30" : ""
      }`}
    >
      <div className="flex">
        {typeof index === "number" && (
          <div className="flex w-9 shrink-0 items-center justify-center border-r border-white/8 bg-white/[0.03] text-sm font-bold text-ink-dim sm:w-11">
            {index + 1}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <Link href={`/tasks/${task.id}`} className="block p-3 sm:p-4">
            <div className="flex gap-3">
              {/* Прев'ю */}
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-navy-950/70 sm:h-20 sm:w-20">
                {task.cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/files/${task.cover}`}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="grid h-full w-full place-items-center text-ink-dim">
                    <IconCube className="h-7 w-7" />
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-2">
                  <h3 className="min-w-0 flex-1 leading-snug font-semibold break-words">
                    {task.title}
                  </h3>
                  <span className="shrink-0 font-mono text-xs text-ink-dim">
                    {task.code ?? `#${task.id}`}
                  </span>
                </div>

                <p className="mt-0.5 truncate text-xs text-ink-muted">
                  {specLine(task)}
                  {task.customer ? ` · ${task.customer}` : ""}
                  {task.order_no ? ` · зам. ${task.order_no}` : ""}
                </p>

                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className={`chip ${STATUS_STYLE[task.status]}`}>
                    {STATUS_LABELS[task.status]}
                    {task.status === "in_progress" && task.worker_name
                      ? ` · ${task.worker_name}`
                      : ""}
                    {/* на доопрацюванні одразу видно, на кому воно висить */}
                    {task.status === "rework"
                      ? ` · ${task.rework_to_name ?? "відділ моделювання"}`
                      : ""}
                  </span>
                  {task.priority === "urgent" && !closed && (
                    <span className={`chip ${PRIORITY_STYLE.urgent}`}>Терміново</span>
                  )}
                  {due && !closed && <span className={`chip ${DUE_TONE[due.tone]}`}>{due.label}</span>}
                  {task.assignee_name && (
                    <span className="chip bg-gold-500/12 text-gold-300 ring-1 ring-gold-500/25">
                      Закріплено: {task.assignee_name}
                    </span>
                  )}
                  {/* поля немає в даних у тих, кому бюджет бачити не можна */}
                  {task.budget_uah != null && (
                    <span className="chip bg-ok/12 text-ok ring-1 ring-ok/25">
                      {formatMoney(task.budget_uah)}
                    </span>
                  )}
                </div>

                {task.file_count > 0 && (
                  <div className="mt-2 flex items-center gap-3 text-xs text-ink-dim">
                    {task.image_count > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <IconImage className="h-4 w-4" />
                        {task.image_count}
                      </span>
                    )}
                    {task.model_count > 0 && (
                      <span className="inline-flex items-center gap-1 text-gold-400">
                        <IconCube className="h-4 w-4" />
                        {task.model_count} 3D
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <IconPaperclip className="h-4 w-4" />
                      {task.file_count}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </Link>

          {/* empty:hidden — щоб не було порожньої смужки, коли доступних дій немає */}
          {actions && (
            <div className="flex flex-wrap items-center gap-2 border-t border-white/8 px-3 py-2.5 empty:hidden sm:px-4">
              {actions}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
