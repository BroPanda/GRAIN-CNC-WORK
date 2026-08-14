"use client";

/**
 * Довідник матеріалів. У задачі зберігається сам текст матеріалу, а не
 * посилання сюди, тому правки списку не переписують давні задачі — там
 * лишається те, з чим тоді працювали.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Material } from "@/lib/types";
import { addMaterial, deleteMaterial, renameMaterial } from "@/lib/actions";
import { useAction } from "./useAction";
import Dialog from "./Dialog";
import { IconCheck, IconEdit, IconPlus, IconTrash, IconX } from "./Icons";

export default function MaterialsEditor({ materials }: { materials: Material[] }) {
  const router = useRouter();
  const { run, pending, error } = useAction();
  const [adding, setAdding] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [removing, setRemoving] = useState<Material | null>(null);

  const refresh = () => router.refresh();

  const submitNew = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!adding.trim()) return;
    run(() => addMaterial(adding), () => {
      setAdding("");
      refresh();
    });
  };

  const saveName = () => {
    if (editingId === null) return;
    run(() => renameMaterial(editingId, editingName), () => {
      setEditingId(null);
      refresh();
    });
  };

  return (
    <>
      <form onSubmit={submitNew} className="mb-4 flex gap-2">
        <input
          className="field"
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          placeholder="Новий матеріал — напр. «Латунь»"
          aria-label="Новий матеріал"
        />
        <button type="submit" className="btn btn-primary" disabled={pending || !adding.trim()}>
          <IconPlus className="h-4 w-4" />
          Додати
        </button>
      </form>

      {error && (
        <p className="mb-3 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">
          {error}
        </p>
      )}

      {!materials.length ? (
        <p className="card p-6 text-center text-sm text-ink-muted">
          Список порожній — додайте перший матеріал.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {materials.map((material) => (
            <li key={material.id} className="card flex items-center gap-2 p-3">
              {editingId === material.id ? (
                <>
                  <input
                    className="field"
                    value={editingName}
                    autoFocus
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveName();
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    aria-label={`Назва матеріалу ${material.name}`}
                  />
                  <button
                    type="button"
                    className="btn btn-ok btn-sm !px-2"
                    aria-label="Зберегти"
                    disabled={pending || !editingName.trim()}
                    onClick={saveName}
                  >
                    <IconCheck className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm !px-2"
                    aria-label="Скасувати"
                    onClick={() => setEditingId(null)}
                  >
                    <IconX className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate font-semibold">{material.name}</span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm !px-2"
                    aria-label={`Перейменувати ${material.name}`}
                    disabled={pending}
                    onClick={() => {
                      setEditingId(material.id);
                      setEditingName(material.name);
                    }}
                  >
                    <IconEdit className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm !px-2 text-danger"
                    aria-label={`Прибрати ${material.name}`}
                    disabled={pending}
                    onClick={() => setRemoving(material)}
                  >
                    <IconTrash className="h-4 w-4" />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={removing !== null}
        title={`Прибрати «${removing?.name ?? ""}»?`}
        onClose={() => setRemoving(null)}
      >
        <p className="mb-4 text-sm text-ink-muted">
          Матеріал зникне з підказок у формі задачі. Задач це не зачепить: у них
          зберігається сам текст, тож давні роботи так і лишаться з цим матеріалом.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn btn-danger flex-1"
            disabled={pending}
            onClick={() =>
              removing &&
              run(() => deleteMaterial(removing.id), () => {
                setRemoving(null);
                refresh();
              })
            }
          >
            {pending ? "Прибираю…" : "Прибрати"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setRemoving(null)}>
            Скасувати
          </button>
        </div>
      </Dialog>
    </>
  );
}
