import type { Priority, Status } from "./types";

/**
 * Час із БД приходить як ISO-рядок ("2026-08-05T18:46:27.705Z").
 * Формат без зони ("YYYY-MM-DD HH:MM:SS") теж підтримуємо — трактуємо як UTC.
 */
export function parseUtc(value: string): Date {
  const hasZone = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(value);
  return new Date(hasZone ? value : `${value.replace(" ", "T")}Z`);
}

export function formatDateTime(value: string): string {
  return parseUtc(value).toLocaleString("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function relativeTime(value: string): string {
  const diff = Date.now() - parseUtc(value).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "щойно";
  if (min < 60) return `${min} хв тому`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours} год тому`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} дн тому`;
  return formatDateTime(value);
}

export function formatDueDate(due: string): string {
  const [y, m, d] = due.split("-");
  return `${d}.${m}.${y.slice(2)}`;
}

export interface DueMeta {
  label: string;
  tone: "danger" | "warn" | "muted";
}

/** Наскільки гарячий дедлайн: прострочено / сьогодні-завтра / спокійно. */
export function dueMeta(due: string | null): DueMeta | null {
  if (!due) return null;
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
    today.getDate()
  ).padStart(2, "0")}`;
  const days = Math.round(
    (new Date(`${due}T00:00:00`).getTime() - new Date(`${todayStr}T00:00:00`).getTime()) / 86400000
  );

  if (days < 0) return { label: `Прострочено на ${Math.abs(days)} дн`, tone: "danger" };
  if (days === 0) return { label: "Термін — сьогодні", tone: "danger" };
  if (days === 1) return { label: "Термін — завтра", tone: "warn" };
  if (days <= 3) return { label: `Через ${days} дн`, tone: "warn" };
  return { label: `До ${formatDueDate(due)}`, tone: "muted" };
}

export const STATUS_STYLE: Record<Status, string> = {
  queued: "bg-navy-600/40 text-ink-muted ring-1 ring-white/10",
  in_progress: "bg-info/20 text-info ring-1 ring-info/30",
  rework: "bg-warn/20 text-warn ring-1 ring-warn/30",
  done: "bg-ok/20 text-ok ring-1 ring-ok/30",
  cancelled: "bg-white/8 text-ink-dim ring-1 ring-white/10 line-through",
};

export const PRIORITY_STYLE: Record<Priority, string> = {
  normal: "bg-white/8 text-ink-dim ring-1 ring-white/10",
  urgent: "bg-danger/20 text-danger ring-1 ring-danger/35",
};

export function specLine(task: {
  material: string;
  thickness_mm: number | null;
  quantity: number;
}): string {
  const parts: string[] = [];
  if (task.material) parts.push(task.material);
  if (task.thickness_mm) parts.push(`${task.thickness_mm} мм`);
  parts.push(`${task.quantity} шт`);
  return parts.join(" · ");
}
