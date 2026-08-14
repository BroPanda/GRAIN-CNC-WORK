"use client";

/**
 * Очищення сховища: прибирає файли давно закритих задач. Самі задачі,
 * історія і статистика лишаються — зникає тільки те, що важить. Кнопка
 * видна лише власнику, автоматично нічого не чиститься.
 */

import { useState } from "react";
import { PURGE_LABELS, PURGE_MONTHS } from "@/lib/types";
import { purgeOldFiles } from "@/lib/actions";
import { humanSize } from "@/lib/storage-shared";
import Dialog from "./Dialog";
import { useAction } from "./useAction";
import { IconTrash } from "./Icons";

interface Props {
  /** Скільки місця займають файли під кожен період — рахує сервер. */
  preview: Record<number, { tasks: number; files: number; bytes: number }>;
}

export default function ArchiveCleanup({ preview }: Props) {
  const [open, setOpen] = useState(false);
  const [months, setMonths] = useState<number>(12);
  const { run, pending, error } = useAction();

  const chosen = preview[months] ?? { tasks: 0, files: 0, bytes: 0 };
  const total = Object.values(preview).reduce((max, p) => Math.max(max, p.bytes), 0);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn btn-ghost btn-sm shrink-0">
        <IconTrash className="h-4 w-4" />
        Очистити сховище
      </button>

      <Dialog open={open} title="Очищення сховища" onClose={() => setOpen(false)}>
        <p className="mb-3 text-sm text-ink-muted">
          Прибирає файли закритих задач — моделі, фото, креслення. Самі задачі,
          історія і вся статистика лишаються на місці.
        </p>

        <fieldset className="mb-4">
          <legend className="label mb-1.5">Чистити задачі</legend>
          <div className="flex flex-col gap-1.5">
            {PURGE_MONTHS.map((m) => {
              const p = preview[m] ?? { tasks: 0, files: 0, bytes: 0 };
              return (
                <label
                  key={m}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2 text-sm transition ${
                    months === m
                      ? "border-gold-500/60 bg-gold-500/10"
                      : "border-white/10 hover:border-white/20"
                  }`}
                >
                  <input
                    type="radio"
                    name="months"
                    value={m}
                    checked={months === m}
                    onChange={() => setMonths(m)}
                    className="accent-gold-500"
                  />
                  <span className="flex-1">{PURGE_LABELS[m]}</span>
                  <span className="text-ink-dim">
                    {p.files ? `${p.files} шт · ${humanSize(p.bytes)}` : "нічого"}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {chosen.files > 0 ? (
          <p className="mb-3 text-sm">
            Буде видалено <span className="font-bold">{chosen.files}</span> файлів у{" "}
            <span className="font-bold">{chosen.tasks}</span> задачах — це{" "}
            <span className="font-bold text-ok">{humanSize(chosen.bytes)}</span>. Відновити їх
            буде неможливо.
          </p>
        ) : (
          <p className="mb-3 text-sm text-ink-muted">
            За цим періодом файлів немає{total > 0 ? " — спробуйте коротший" : ""}.
          </p>
        )}

        {error && <p className="mb-3 text-sm text-danger">{error}</p>}

        <div className="flex gap-2">
          <button
            type="button"
            className="btn btn-danger flex-1"
            disabled={pending || chosen.files === 0}
            onClick={() => run(() => purgeOldFiles(months), () => setOpen(false))}
          >
            {pending ? "Чищу…" : "Видалити файли"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
            Скасувати
          </button>
        </div>
      </Dialog>
    </>
  );
}
