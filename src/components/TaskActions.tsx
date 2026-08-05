"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  cancelTask,
  completeTask,
  nudgeTask,
  reopenTask,
  returnToQueue,
  sendToRework,
  takeTask,
} from "@/lib/actions";
import type { TaskListItem, User } from "@/lib/types";
import type { Abilities } from "@/lib/abilities";
import { useAction } from "./useAction";
import Dialog from "./Dialog";
import {
  IconArrowDown,
  IconArrowUp,
  IconCheck,
  IconPlay,
  IconRework,
  IconX,
} from "./Icons";

type DialogKind = "rework" | "done" | "cancel" | "return" | null;

const DIALOG_META: Record<
  Exclude<DialogKind, null>,
  { title: string; label: string; cta: string; required: boolean; tone: string }
> = {
  rework: {
    title: "Відправити на доопрацювання",
    label: "Причина (обов'язково)",
    cta: "Відправити",
    required: true,
    tone: "btn-danger",
  },
  done: {
    title: "Закрити як виконану",
    label: "Коментар (не обов'язково)",
    cta: "Виконано",
    required: false,
    tone: "btn-ok",
  },
  cancel: {
    title: "Скасувати задачу",
    label: "Причина (не обов'язково)",
    cta: "Скасувати задачу",
    required: false,
    tone: "btn-danger",
  },
  return: {
    title: "Повернути в чергу",
    label: "Що виправлено (не обов'язково)",
    cta: "Повернути в чергу",
    required: false,
    tone: "btn-primary",
  },
};

interface Props {
  task: TaskListItem;
  me: User;
  abilities: Abilities;
  /** Компактний набір для карток у списку. */
  compact?: boolean;
  /** Показувати кнопки зміни місця в черзі. */
  showNudge?: boolean;
  nudgeUpDisabled?: boolean;
  nudgeDownDisabled?: boolean;
}

export default function TaskActions({
  task,
  me,
  abilities,
  compact = false,
  showNudge = false,
  nudgeUpDisabled,
  nudgeDownDisabled,
}: Props) {
  const router = useRouter();
  const { run, pending, error } = useAction();
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [comment, setComment] = useState("");

  const done = () => router.refresh();
  const size = compact ? "btn-sm" : "";

  const openDialog = (kind: DialogKind) => {
    setComment("");
    setDialog(kind);
  };

  const submitDialog = () => {
    const kind = dialog;
    if (!kind) return;
    const map = {
      rework: () => sendToRework(task.id, comment),
      done: () => completeTask(task.id, comment),
      cancel: () => cancelTask(task.id, comment),
      return: () => returnToQueue(task.id, comment),
    } as const;
    run(map[kind], () => {
      setDialog(null);
      done();
    });
  };

  const isMine = task.worker_id === me.id;
  // задачу на доопрацюванні брати не можна, поки її не повернули в чергу
  const canTakeNow = task.status === "queued";
  const meta = dialog ? DIALOG_META[dialog] : null;

  return (
    <>
      {showNudge && abilities.reorder && (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label="Вище в черзі"
            disabled={pending || nudgeUpDisabled}
            onClick={() => run(() => nudgeTask(task.id, -1), done)}
            className="btn btn-ghost btn-sm !px-2"
          >
            <IconArrowUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Нижче в черзі"
            disabled={pending || nudgeDownDisabled}
            onClick={() => run(() => nudgeTask(task.id, 1), done)}
            className="btn btn-ghost btn-sm !px-2"
          >
            <IconArrowDown className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Взяти в роботу */}
      {abilities.take && canTakeNow && (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => takeTask(task.id), done)}
          className={`btn btn-primary ${size}`}
        >
          <IconPlay className="h-4 w-4" />
          Взяти в роботу
        </button>
      )}

      {/* В роботі — завершити / відправити на доопрацювання */}
      {task.status === "in_progress" && (
        <>
          {abilities.close && (
            <button
              type="button"
              disabled={pending}
              onClick={() => openDialog("done")}
              className={`btn btn-ok ${size}`}
            >
              <IconCheck className="h-4 w-4" />
              Виконано
            </button>
          )}
          {(abilities.take || abilities.edit) && (
            <button
              type="button"
              disabled={pending}
              onClick={() => openDialog("rework")}
              className={`btn btn-ghost ${size}`}
            >
              <IconRework className="h-4 w-4" />
              На доопрацювання
            </button>
          )}
          {!isMine && abilities.take && (
            <span className="text-xs text-ink-dim">
              виконує {task.worker_name ?? "інший"}
            </span>
          )}
        </>
      )}

      {/* Черга: можна не брати цю, а прокрутити нижче до іншої */}
      {abilities.take && task.status === "queued" && !compact && (
        <button
          type="button"
          disabled={pending}
          onClick={() => openDialog("rework")}
          className={`btn btn-ghost ${size}`}
        >
          <IconRework className="h-4 w-4" />
          На доопрацювання
        </button>
      )}

      {/* Доопрацювання завершено — назад у чергу */}
      {task.status === "rework" && abilities.edit && (
        <button
          type="button"
          disabled={pending}
          onClick={() => openDialog("return")}
          className={`btn btn-primary ${size}`}
        >
          <IconCheck className="h-4 w-4" />
          Повернути в чергу
        </button>
      )}

      {/* Перевідкрити / скасувати */}
      {abilities.edit && !compact && (
        <>
          {(task.status === "done" || task.status === "cancelled") && (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => reopenTask(task.id), done)}
              className={`btn btn-ghost ${size}`}
            >
              <IconRework className="h-4 w-4" />
              Перевідкрити
            </button>
          )}
          {task.status !== "cancelled" && task.status !== "done" && (
            <button
              type="button"
              disabled={pending}
              onClick={() => openDialog("cancel")}
              className={`btn btn-ghost ${size} text-danger`}
            >
              <IconX className="h-4 w-4" />
              Скасувати
            </button>
          )}
        </>
      )}

      {error && !dialog && (
        <p className="w-full text-sm font-semibold text-danger">{error}</p>
      )}

      <Dialog open={!!dialog} title={meta?.title ?? ""} onClose={() => setDialog(null)}>
        <label className="label" htmlFor="action-comment">
          {meta?.label}
        </label>
        <textarea
          id="action-comment"
          className="field min-h-28"
          value={comment}
          autoFocus
          onChange={(e) => setComment(e.target.value)}
          placeholder={
            dialog === "rework"
              ? "Напр.: у моделі відкриті контури, не ріже по замкнутому шляху"
              : "Кілька слів для історії задачі"
          }
        />
        {error && <p className="mt-2 text-sm font-semibold text-danger">{error}</p>}
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            className={`btn ${meta?.tone} flex-1`}
            disabled={pending || (meta?.required ? comment.trim().length < 3 : false)}
            onClick={submitDialog}
          >
            {pending ? "Зберігаємо…" : meta?.cta}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setDialog(null)}>
            Відміна
          </button>
        </div>
      </Dialog>
    </>
  );
}
