import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { can, requireUser } from "@/lib/auth";
import { getTaskRaw, listMillers } from "@/lib/queries";
import TaskForm from "@/components/TaskForm";

export default async function EditTaskPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const { id } = await params;
  const task = getTaskRaw(Number(id));
  if (!task) notFound();
  if (!can(me, "can_edit_tasks")) redirect(`/tasks/${task.id}`);

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Link href={`/tasks/${task.id}`} className="mb-3 inline-block text-sm text-ink-muted hover:text-ink">
        ← До задачі
      </Link>
      <h1 className="mb-1 text-2xl font-bold">Редагування</h1>
      <p className="mb-5 text-sm text-ink-muted">
        {task.code ?? `#${task.id}`} · про зміни отримають сповіщення виконавець і керівництво.
      </p>
      <TaskForm me={me} millers={listMillers()} task={task} />
    </div>
  );
}
