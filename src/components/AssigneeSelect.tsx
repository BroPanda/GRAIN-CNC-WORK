"use client";

import { useRouter } from "next/navigation";
import { assignTask } from "@/lib/actions";
import type { User } from "@/lib/types";
import { useAction } from "./useAction";

interface Props {
  taskId: number;
  assigneeId: number | null;
  millers: User[];
}

export default function AssigneeSelect({ taskId, assigneeId, millers }: Props) {
  const router = useRouter();
  const { run, pending, error } = useAction();

  return (
    <div>
      <label className="label" htmlFor="assignee-select">
        Закріплення
      </label>
      <select
        id="assignee-select"
        className="field"
        disabled={pending}
        value={assigneeId ? String(assigneeId) : ""}
        onChange={(e) => {
          const value = e.target.value ? Number(e.target.value) : null;
          run(
            () => assignTask(taskId, value),
            () => router.refresh()
          );
        }}
      >
        <option value="">Спільна черга (бачать усі фрезерувальники)</option>
        {millers.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      {error && <p className="mt-1.5 text-sm font-semibold text-danger">{error}</p>}
    </div>
  );
}
