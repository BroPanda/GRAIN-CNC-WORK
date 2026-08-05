"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteTaskFile, uploadTaskFiles } from "@/lib/actions";
import type { TaskFile } from "@/lib/types";
import { ACCEPT_ATTR, humanSize, isViewableModel } from "@/lib/storage-shared";
import ModelViewer from "./ModelViewer";
import Dialog from "./Dialog";
import { useAction } from "./useAction";
import {
  IconCube,
  IconDownload,
  IconImage,
  IconPaperclip,
  IconTrash,
  IconX,
} from "./Icons";

interface Props {
  taskId: number;
  files: TaskFile[];
  canUpload: boolean;
}

export default function TaskFiles({ taskId, files, canUpload }: Props) {
  const router = useRouter();
  const { run, pending, error } = useAction();
  const [lightbox, setLightbox] = useState<TaskFile | null>(null);

  const images = files.filter((f) => f.kind === "image");
  const models = files.filter((f) => f.kind === "model" && isViewableModel(f.ext));
  const others = files.filter((f) => !images.includes(f) && !models.includes(f));

  const upload = (list: FileList | null) => {
    if (!list?.length) return;
    const fd = new FormData();
    Array.from(list).forEach((f) => fd.append("files", f));
    run(
      () => uploadTaskFiles(taskId, fd),
      () => router.refresh()
    );
  };

  const remove = (file: TaskFile) => {
    if (!confirm(`Видалити «${file.original_name}»?`)) return;
    run(
      () => deleteTaskFile(file.id),
      () => router.refresh()
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {/* 3D-моделі */}
      {models.map((file) => (
        <div key={file.id} className="relative">
          <ModelViewer fileId={file.id} ext={file.ext} name={file.original_name} />
          {canUpload && (
            <button
              type="button"
              onClick={() => remove(file)}
              aria-label="Видалити модель"
              className="absolute top-1.5 right-11 rounded-lg p-1.5 text-ink-dim hover:text-danger"
            >
              <IconTrash className="h-4 w-4" />
            </button>
          )}
        </div>
      ))}

      {/* Фото */}
      {images.length > 0 && (
        <div>
          <h3 className="label flex items-center gap-2">
            <IconImage className="h-4 w-4" /> Фото ({images.length})
          </h3>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {images.map((file) => (
              <div key={file.id} className="group relative">
                <button
                  type="button"
                  onClick={() => setLightbox(file)}
                  className="block aspect-square w-full overflow-hidden rounded-xl border border-white/10 bg-navy-950/60"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/files/${file.id}`}
                    alt={file.original_name}
                    loading="lazy"
                    className="h-full w-full object-cover transition group-hover:scale-105"
                  />
                </button>
                {canUpload && (
                  <button
                    type="button"
                    onClick={() => remove(file)}
                    aria-label={`Видалити ${file.original_name}`}
                    className="absolute top-1 right-1 rounded-lg bg-navy-950/80 p-1.5 text-ink-muted opacity-0 transition group-hover:opacity-100 hover:text-danger focus:opacity-100"
                  >
                    <IconTrash className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Інші файли */}
      {others.length > 0 && (
        <div>
          <h3 className="label flex items-center gap-2">
            <IconPaperclip className="h-4 w-4" /> Файли ({others.length})
          </h3>
          <ul className="flex flex-col gap-2">
            {others.map((file) => (
              <li
                key={file.id}
                className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-navy-950/50 px-3 py-2.5"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/5 font-mono text-[10px] font-bold text-gold-400">
                  {file.ext.toUpperCase().slice(0, 4)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{file.original_name}</span>
                  <span className="text-xs text-ink-dim">{humanSize(file.size_bytes)}</span>
                </span>
                <a
                  href={`/api/files/${file.id}?download`}
                  className="btn btn-ghost btn-sm shrink-0 !px-2"
                  aria-label="Завантажити"
                >
                  <IconDownload className="h-4 w-4" />
                </a>
                {canUpload && (
                  <button
                    type="button"
                    onClick={() => remove(file)}
                    aria-label={`Видалити ${file.original_name}`}
                    className="shrink-0 p-1.5 text-ink-dim hover:text-danger"
                  >
                    <IconTrash className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!files.length && (
        <p className="rounded-xl border border-dashed border-white/12 px-4 py-6 text-center text-sm text-ink-dim">
          До задачі ще не додано ні фото, ні моделей.
        </p>
      )}

      {canUpload && (
        <label className="btn btn-ghost cursor-pointer">
          <IconCube className="h-4 w-4" />
          {pending ? "Завантаження…" : "Додати фото / 3D / креслення"}
          <input
            type="file"
            multiple
            accept={ACCEPT_ATTR}
            className="hidden"
            disabled={pending}
            onChange={(e) => {
              upload(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      )}

      {error && <p className="text-sm font-semibold text-danger">{error}</p>}

      {/* Лайтбокс */}
      <Dialog
        open={!!lightbox}
        title={lightbox?.original_name ?? ""}
        onClose={() => setLightbox(null)}
      >
        {lightbox && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/files/${lightbox.id}`}
              alt={lightbox.original_name}
              className="max-h-[70dvh] w-full rounded-xl object-contain"
            />
            <div className="mt-3 flex gap-2">
              <a
                href={`/api/files/${lightbox.id}?download`}
                className="btn btn-ghost btn-sm flex-1"
              >
                <IconDownload className="h-4 w-4" />
                Завантажити оригінал
              </a>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setLightbox(null)}
              >
                <IconX className="h-4 w-4" />
                Закрити
              </button>
            </div>
          </>
        )}
      </Dialog>
    </div>
  );
}
