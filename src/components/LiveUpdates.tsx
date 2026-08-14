"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { bucketForType } from "@/lib/notif-groups";
import { playNotifSound, primeAudio, shouldPlay } from "./notifySound";

const POLL_MS = 15_000;

/**
 * Тримає відкриту вкладку живою: як тільки в цеху щось змінилось — задачу
 * взяли, закрили, повернули на доопрацювання, додали файл чи коментар —
 * сторінка перемальовується сама, без перезавантаження. Нові сповіщення
 * додатково дзеленчать своїм звуком.
 *
 * Опитування, а не веб-сокет: на serverless тримати відкрите з'єднання дорого
 * й ненадійно, а 15 секунд затримки для задачника цеху непомітні. Поки вкладка
 * у фоні, не смикаємо сервер узагалі.
 */
export default function LiveUpdates({ userId }: { userId: number }) {
  const router = useRouter();
  // стан на момент останньої перевірки; null — ще не знаємо (перший запит)
  const version = useRef<string | null>(null);
  const lastNotif = useRef<number | null>(null);

  useEffect(() => {
    // на першому дотику до сторінки дозволяємо браузеру програвати звук
    const prime = () => primeAudio();
    window.addEventListener("pointerdown", prime, { once: true });
    window.addEventListener("keydown", prime, { once: true });

    const key = `freza_last_notif_${userId}`;
    const stored = Number(localStorage.getItem(key));
    if (stored) lastNotif.current = stored;

    let stopped = false;

    const check = async () => {
      if (stopped || document.hidden) return;
      try {
        const res = await fetch("/api/live", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as {
          version: string;
          id: number;
          type: string | null;
          unread: number;
        };

        // 1. Звук — лише на справді нове сповіщення
        if (data.id) {
          const previous = lastNotif.current;
          lastNotif.current = data.id;
          localStorage.setItem(key, String(data.id));
          // перший запит лише запамʼятовує стан, інакше дзенькало б на кожному вході
          if (previous !== null && data.id > previous && data.type) {
            const bucket = bucketForType(data.type);
            if (shouldPlay(bucket)) playNotifSound(bucket);
          }
        }

        // 2. Перемальовуємо, якщо змінилось будь-що: задачі, події, файли
        //    або лічильник непрочитаних (його теж видно на екрані)
        const now = `${data.version}|${data.unread}`;
        const was = version.current;
        version.current = now;
        if (was !== null && was !== now) router.refresh();
      } catch {
        // мережа моргнула — просто спробуємо наступного разу
      }
    };

    void check();
    const timer = setInterval(() => void check(), POLL_MS);
    // повернулись на вкладку — перевіряємо одразу, не чекаючи циклу
    const onVisible = () => document.visibilityState === "visible" && void check();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      document.removeEventListener("pointerdown", prime);
      document.removeEventListener("keydown", prime);
    };
  }, [router, userId]);

  return null;
}
