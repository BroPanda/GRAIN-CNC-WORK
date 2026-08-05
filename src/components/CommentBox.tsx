"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { addComment } from "@/lib/actions";
import { useAction } from "./useAction";

export default function CommentBox({ taskId }: { taskId: number }) {
  const router = useRouter();
  const { run, pending, error } = useAction();
  const [text, setText] = useState("");

  const send = () => {
    run(
      () => addComment(taskId, text),
      () => {
        setText("");
        router.refresh();
      }
    );
  };

  return (
    <div>
      <textarea
        className="field min-h-20"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Написати в задачу: питання, уточнення, що змінилось…"
      />
      {error && <p className="mt-1.5 text-sm font-semibold text-danger">{error}</p>}
      <button
        type="button"
        className="btn btn-ghost btn-sm mt-2"
        disabled={pending || !text.trim()}
        onClick={send}
      >
        {pending ? "Надсилаємо…" : "Надіслати"}
      </button>
    </div>
  );
}
