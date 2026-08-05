"use client";

import { useCallback, useState, useTransition } from "react";
import type { ActionResult } from "@/lib/actions";

/**
 * Обгортка над серверними діями: тримає стан «виконується» та текст помилки,
 * щоб кожна кнопка не писала це заново.
 */
export function useAction() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    (fn: () => Promise<ActionResult>, onDone?: () => void) => {
      setError(null);
      setBusy(true);
      void fn()
        .then((res) => {
          if (!res.ok) {
            setError(res.error ?? "Не вдалося виконати дію");
            return;
          }
          startTransition(() => onDone?.());
        })
        .catch((e: unknown) => setError(e instanceof Error ? e.message : "Помилка мережі"))
        .finally(() => setBusy(false));
    },
    []
  );

  return { run, pending: pending || busy, error, setError };
}
