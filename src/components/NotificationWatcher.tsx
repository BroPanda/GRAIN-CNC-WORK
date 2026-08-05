"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { bucketForType } from "@/lib/notif-groups";
import { playNotifSound, primeAudio, shouldPlay } from "./notifySound";

const POLL_MS = 15_000;

/**
 * Стежить за новими сповіщеннями у відкритій вкладці: дзенькає своїм звуком
 * під тип події й оновлює лічильник на дзвіночку без перезавантаження.
 *
 * Опитування, а не веб-сокет: на serverless тримати відкрите зʼєднання дорого
 * й ненадійно, а 15 секунд затримки для задачника цеху непомітні.
 */
export default function NotificationWatcher({ userId }: { userId: number }) {
  const router = useRouter();
  // id останнього побаченого сповіщення; null — ще не знаємо (перший запит)
  const lastSeen = useRef<number | null>(null);

  useEffect(() => {
    // на першому дотику до сторінки дозволяємо браузеру програвати звук
    const prime = () => primeAudio();
    window.addEventListener("pointerdown", prime, { once: true });
    window.addEventListener("keydown", prime, { once: true });

    const key = `grain_last_notif_${userId}`;
    const stored = Number(localStorage.getItem(key));
    if (stored) lastSeen.current = stored;

    let stopped = false;

    const check = async () => {
      if (stopped || document.hidden) return;
      try {
        const res = await fetch("/api/notifications/latest", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { id: number; type: string | null };
        if (!data.id) return;

        const previous = lastSeen.current;
        lastSeen.current = data.id;
        localStorage.setItem(key, String(data.id));

        // перший запит лише запамʼятовує стан — інакше дзенькне на кожному вході
        if (previous === null || data.id <= previous) return;

        if (data.type) {
          const bucket = bucketForType(data.type);
          if (shouldPlay(bucket)) playNotifSound(bucket);
        }
        router.refresh(); // підтягне лічильник на дзвіночку і список
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
