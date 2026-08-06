"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { readNotification } from "@/lib/actions";
import { formatExact, relativeTime } from "@/lib/format";
import type { Notification } from "@/lib/types";
import { useAction } from "./useAction";
import { IconCheck } from "./Icons";

const TYPE_TONE: Record<string, string> = {
  rework: "border-l-warn",
  done: "border-l-ok",
  cancelled: "border-l-danger",
  taken: "border-l-info",
  created: "border-l-gold-500",
  returned: "border-l-gold-500",
  comment: "border-l-info",
  files_added: "border-l-white/30",
};

export default function NotificationItem({ item }: { item: Notification }) {
  const router = useRouter();
  const { run, pending } = useAction();

  const markRead = (e: React.MouseEvent) => {
    // клік по «галочці» не має відкривати задачу
    e.preventDefault();
    e.stopPropagation();
    run(
      () => readNotification(item.id),
      () => router.refresh()
    );
  };

  const body = (
    <div
      className={`card border-l-4 p-3.5 transition ${
        TYPE_TONE[item.type] ?? "border-l-white/15"
      } ${item.read_at ? "opacity-65" : ""}`}
    >
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 text-sm">
          {!item.read_at && (
            <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-gold-500 align-middle" />
          )}
          {item.text}
        </p>
        <span className="shrink-0 text-right text-[11px] whitespace-nowrap text-ink-dim">
          <span className="block font-mono">{formatExact(item.created_at)}</span>
          {/* «щойно» на сервері може стати «1 хв тому» вже в браузері —
              для відносного часу розбіжність нормальна */}
          <span className="block opacity-70" suppressHydrationWarning>
            {relativeTime(item.created_at)}
          </span>
        </span>
        {!item.read_at && (
          <button
            type="button"
            onClick={markRead}
            disabled={pending}
            aria-label="Позначити прочитаним"
            title="Позначити прочитаним"
            className="-my-1 shrink-0 rounded-lg p-1.5 text-ink-dim hover:bg-white/8 hover:text-ok disabled:opacity-40"
          >
            <IconCheck className="h-4 w-4" />
          </button>
        )}
      </div>
      {item.task_code && (
        <div className="mt-1 font-mono text-xs text-ink-dim">{item.task_code}</div>
      )}
    </div>
  );

  return item.task_id ? <Link href={`/tasks/${item.task_id}`}>{body}</Link> : body;
}
