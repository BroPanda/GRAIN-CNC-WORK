import { redirect } from "next/navigation";
import { can, requireUser } from "@/lib/auth";
import { listMillers } from "@/lib/queries";
import TaskForm from "@/components/TaskForm";

export default async function NewTaskPage() {
  const me = await requireUser();
  if (!can(me, "can_create_tasks")) redirect("/queue");

  return (
    <div className="mx-auto w-full max-w-2xl">
      <h1 className="mb-1 text-2xl font-bold">Нова задача</h1>
      <p className="mb-5 text-sm text-ink-muted">
        Задача стане в кінець черги. Терміновим і позначеним «на початок» — місце зверху.
      </p>
      <TaskForm me={me} millers={listMillers()} />
    </div>
  );
}
