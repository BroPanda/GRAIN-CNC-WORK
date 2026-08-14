"use client";

/**
 * Секція списку задач із згортанням по кліку на заголовок.
 * Стан кожної секції запамʼятовується у браузері, щоб після переходу
 * сторінкою й перезавантаження вигляд лишався таким, як людина його склала.
 */

import { useEffect, useState } from "react";
import { IconChevron } from "./Icons";

interface Props {
  /** Ключ для запамʼятовування стану — стабільний, не залежить від назви. */
  id: string;
  title: string;
  count: number;
  icon?: React.ReactNode;
  hint?: string;
  children: React.ReactNode;
}

const storageKey = (id: string) => `section:${id}`;

export default function Section({ id, title, count, icon, hint, children }: Props) {
  // на сервері й на першому рендері секція завжди розгорнута — інакше розмітка
  // не збіглася б із тим, що прийшло з сервера
  const [open, setOpen] = useState(true);

  useEffect(() => {
    setOpen(localStorage.getItem(storageKey(id)) !== "closed");
  }, [id]);

  const toggle = () => {
    setOpen((prev) => {
      localStorage.setItem(storageKey(id), prev ? "closed" : "open");
      return !prev;
    });
  };

  return (
    <section className="mb-6">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="mb-2.5 flex w-full items-center gap-2 text-left"
      >
        <IconChevron
          className={`h-4 w-4 text-ink-dim transition-transform ${open ? "" : "-rotate-90"}`}
        />
        <h2 className="flex items-center gap-2 text-sm font-bold tracking-wide text-ink-muted uppercase">
          {icon}
          {title}
        </h2>
        <span className="rounded-full bg-white/8 px-2 py-0.5 text-xs font-bold text-ink-dim">
          {count}
        </span>
      </button>
      {open && (
        <>
          {hint && <p className="mb-2.5 text-xs text-ink-dim">{hint}</p>}
          {children}
        </>
      )}
    </section>
  );
}
