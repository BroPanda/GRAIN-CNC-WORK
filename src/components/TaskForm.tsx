"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { createTask, updateTask } from "@/lib/actions";
import type { Task, User } from "@/lib/types";
import { ACCEPT_ATTR, humanSize } from "@/lib/storage-shared";
import { useAction } from "./useAction";
import { uploadToBlob } from "./uploadToBlob";
import { IconCube, IconImage, IconPaperclip, IconX } from "./Icons";

const MATERIALS = [
  "ПВХ",
  "Акрил",
  "Композит (АКП)",
  "Фанера",
  "ЛДСП / МДФ",
  "Дерево",
  "XPS / пінопласт",
  "Полікарбонат",
  "Алюміній",
  "Латунь",
  "Оргскло",
];

interface Props {
  me: User;
  millers: User[];
  /** Якщо передано — режим редагування. */
  task?: Task;
  /** У хмарі браузер вантажить файли напряму у сховище, минаючи сервер. */
  directUpload: boolean;
}

export default function TaskForm({ me, millers, task, directUpload }: Props) {
  const router = useRouter();
  const { run, pending, error } = useAction();
  const formRef = useRef<HTMLFormElement>(null);
  const [picked, setPicked] = useState<File[]>([]);

  const editing = !!task;

  const onFiles = (list: FileList | null) => {
    if (!list) return;
    setPicked((prev) => [...prev, ...Array.from(list)]);
  };

  const removePicked = (i: number) => setPicked((prev) => prev.filter((_, k) => k !== i));

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.delete("files");

    run(async () => {
      if (directUpload && picked.length) {
        // спершу файли — у сховище, у формі лишаються тільки посилання
        fd.set("blob_files", JSON.stringify(await uploadToBlob(picked, null)));
      } else {
        picked.forEach((f) => fd.append("files", f));
      }
      return editing ? updateTask(task.id, fd) : createTask(fd);
    }, () => router.push(editing ? `/tasks/${task.id}` : "/queue"));
  };

  return (
    <form ref={formRef} onSubmit={submit} className="flex flex-col gap-4">
      <div className="card p-4">
        <label className="label" htmlFor="title">
          Назва задачі *
        </label>
        <input
          id="title"
          name="title"
          className="field"
          required
          maxLength={160}
          defaultValue={task?.title ?? ""}
          placeholder="Напр.: Об'ємні літери «АВТОМИР», фрезерування лиця"
          autoFocus={!editing}
        />

        <label className="label mt-4" htmlFor="description">
          Опис і вимоги
        </label>
        <textarea
          id="description"
          name="description"
          className="field min-h-32"
          defaultValue={task?.description ?? ""}
          placeholder={
            "Що робимо, на що звернути увагу, які фрези, глибина, режими, як пакувати…"
          }
        />
      </div>

      <div className="card p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="col-span-2">
            <label className="label" htmlFor="material">
              Матеріал
            </label>
            <input
              id="material"
              name="material"
              className="field"
              list="materials"
              defaultValue={task?.material ?? ""}
              placeholder="ПВХ"
            />
            <datalist id="materials">
              {MATERIALS.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="label" htmlFor="thickness_mm">
              Товщина, мм
            </label>
            <input
              id="thickness_mm"
              name="thickness_mm"
              className="field"
              inputMode="decimal"
              defaultValue={task?.thickness_mm ?? ""}
              placeholder="10"
            />
          </div>
          <div>
            <label className="label" htmlFor="quantity">
              Кількість
            </label>
            <input
              id="quantity"
              name="quantity"
              className="field"
              type="number"
              min={1}
              defaultValue={task?.quantity ?? 1}
            />
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="customer">
              Замовник
            </label>
            <input
              id="customer"
              name="customer"
              className="field"
              defaultValue={task?.customer ?? ""}
              placeholder="ТОВ «Автомир»"
            />
          </div>
          <div>
            <label className="label" htmlFor="order_no">
              № замовлення
            </label>
            <input
              id="order_no"
              name="order_no"
              className="field"
              defaultValue={task?.order_no ?? ""}
              placeholder="2026-114"
            />
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="due_date">
              Термін здачі
            </label>
            <input
              id="due_date"
              name="due_date"
              className="field"
              type="date"
              defaultValue={task?.due_date ?? ""}
            />
          </div>
          <div>
            <label className="label" htmlFor="priority">
              Пріоритет
            </label>
            <select
              id="priority"
              name="priority"
              className="field"
              defaultValue={task?.priority ?? "normal"}
            >
              <option value="normal">Звичайний</option>
              <option value="urgent">Терміново</option>
            </select>
          </div>
        </div>

        <div className="mt-3">
          <label className="label" htmlFor="assignee_id">
            Виконавець
          </label>
          <select
            id="assignee_id"
            name="assignee_id"
            className="field"
            defaultValue={task?.assignee_id ? String(task.assignee_id) : ""}
          >
            <option value="">Спільна черга — візьме будь-хто вільний</option>
            {millers.map((m) => (
              <option key={m.id} value={m.id}>
                Закріпити за {m.name}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-ink-dim">
            Закріплену задачу бачить і бере тільки цей фрезерувальник.
          </p>
        </div>

        {!editing && (
          <label className="mt-4 flex items-center gap-2.5 text-sm">
            <input type="checkbox" name="to_top" className="h-5 w-5 accent-[#f2a825]" />
            Поставити на початок черги
          </label>
        )}
      </div>

      {/* Файли */}
      <div className="card p-4">
        <div className="label">Фото, 3D-моделі та креслення</div>
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-white/20 bg-white/[0.02] px-4 py-6 text-center transition hover:border-gold-500/50 hover:bg-gold-500/5">
          <span className="flex gap-3 text-ink-dim">
            <IconImage className="h-6 w-6" />
            <IconCube className="h-6 w-6" />
            <IconPaperclip className="h-6 w-6" />
          </span>
          <span className="font-semibold">Вибрати файли</span>
          <span className="text-xs text-ink-dim">
            STL, OBJ, 3MF, GLB — з переглядом у браузері · STEP, DXF, AI, CDR, PDF, G-code — на
            завантаження · до 60 МБ на файл
          </span>
          <input
            type="file"
            name="files"
            multiple
            accept={ACCEPT_ATTR}
            className="hidden"
            onChange={(e) => onFiles(e.target.files)}
          />
        </label>

        {picked.length > 0 && (
          <ul className="mt-3 flex flex-col gap-2">
            {picked.map((f, i) => (
              <li
                key={`${f.name}-${i}`}
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-navy-950/50 px-3 py-2 text-sm"
              >
                <IconPaperclip className="h-4 w-4 shrink-0 text-ink-dim" />
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <span className="shrink-0 text-xs text-ink-dim">{humanSize(f.size)}</span>
                <button
                  type="button"
                  onClick={() => removePicked(i)}
                  aria-label={`Прибрати ${f.name}`}
                  className="shrink-0 text-ink-dim hover:text-danger"
                >
                  <IconX className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && (
        <p className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm font-semibold text-danger">
          {error}
        </p>
      )}

      <div className="sticky bottom-20 z-10 flex gap-2 lg:bottom-0 lg:static">
        <button type="submit" className="btn btn-primary flex-1 shadow-lg shadow-black/30" disabled={pending}>
          {pending
            ? "Зберігаємо…"
            : editing
              ? "Зберегти зміни"
              : "Створити і поставити в чергу"}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => router.back()}
          disabled={pending}
        >
          Відміна
        </button>
      </div>

      <p className="pb-2 text-xs text-ink-dim">
        Задачу створює {me.name}. Про нову задачу отримають сповіщення фрезерувальники, власник і
        відділ моделювання.
      </p>
    </form>
  );
}
