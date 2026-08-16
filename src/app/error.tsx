"use client";

import { useEffect, useState } from "react";
import { LogoMark } from "@/components/Logo";

/**
 * Що бачить людина, коли сторінка не змогла зібратися. Практично завжди
 * причина одна: база даних спала й не встигла прокинутися (безкоштовний Neon
 * засинає при простої). Тому це не «щось пішло не так», а вікно очікування —
 * саме пробує ще раз, і з другої спроби база вже на ногах.
 *
 * Стоїть у корені app/, а не в (app)/: error.tsx не ловить помилки того
 * layout, що лежить з ним в одній теці, а перший запит у базу робить саме
 * (app)/layout.tsx. Звідси й власне тло — сайдбара в цей момент ще немає.
 *
 * Тексту помилки тут не показуємо свідомо: на проді Next не передає в браузер
 * повідомлення серверних помилок, лишається тільки digest для звірки з логами.
 */

/** Скільки разів пробуємо самі, перш ніж віддати кнопку в руки людині. */
const AUTO_RETRIES = 3;

/** Пауза перед кожною автоспробою: далі — довше, щоб дати базі встати. */
const DELAYS_MS = [2_000, 4_000, 8_000];

/** Через стільки тиші вважаємо, що це вже новий випадок, а не той самий. */
const FORGET_AFTER_MS = 60_000;

/**
 * Лічильник спроб живе поза компонентом. Інакше його не вберегти: при кожній
 * невдалій спробі межа помилок перемальовує це вікно, стан всередині
 * обнуляється — і автоспроби ходили б по колу без кінця. Скидаємо не при
 * закритті вікна (це теж частина того самого перемальовування), а по часу.
 */
let attempt = 0;
let lastFailAt = 0;

function nextDelay(): number | null {
  const now = Date.now();
  if (now - lastFailAt > FORGET_AFTER_MS) attempt = 0;
  lastFailAt = now;
  return attempt < AUTO_RETRIES ? (DELAYS_MS[attempt] ?? 8_000) : null;
}

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  // рахуємо один раз на показ вікна, ще до першого малювання
  const [delay] = useState(nextDelay);
  const [left, setLeft] = useState(Math.ceil((delay ?? 0) / 1000));

  useEffect(() => {
    console.error(error);
  }, [error]);

  useEffect(() => {
    if (delay === null) return;
    attempt += 1;

    const tick = setInterval(() => setLeft((n) => (n > 0 ? n - 1 : 0)), 1_000);
    const go = setTimeout(retry, delay);
    return () => {
      clearInterval(tick);
      clearTimeout(go);
    };
  }, [delay, retry]);

  const waiting = delay !== null;

  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="card w-full max-w-sm p-6 text-center">
        <div className="mb-4 flex justify-center">
          <LogoMark size={56} />
        </div>

        <h1 className="text-lg font-bold">
          {waiting ? "Готуємо задачник" : "База не відповідає"}
        </h1>

        <p className="mt-2 text-sm text-ink-muted">
          {waiting
            ? "База даних прокидається після простою. Це кілька секунд — зачекайте, сторінка відкриється сама."
            : "Не вдалося зʼєднатися з базою. Спробуйте ще раз, а якщо не допомагає — напишіть розробнику."}
        </p>

        {waiting ? (
          <div
            className="mt-5 flex items-center justify-center gap-2.5 text-sm text-ink-dim"
            aria-live="polite"
          >
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-gold-500" />
            {left > 0 ? `Повторюємо через ${left} с` : "Пробуємо…"}
          </div>
        ) : (
          <button type="button" onClick={() => retry()} className="btn btn-primary mt-5 w-full">
            Спробувати ще раз
          </button>
        )}

        {error.digest && <p className="mt-4 text-[11px] text-ink-dim">Код: {error.digest}</p>}
      </div>
    </div>
  );
}
