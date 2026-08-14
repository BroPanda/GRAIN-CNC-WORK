import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { can, requireUser } from "@/lib/auth";
import { getTask, listCustomers, listMaterials, listMillers } from "@/lib/queries";
import { orderLabel } from "@/lib/format";
import { directUploadEnabled } from "@/lib/storage";
import TaskForm from "@/components/TaskForm";

export default async function EditTaskPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const { id } = await params;
  // саме getTask, а не getTaskRaw: форма — клієнтський компонент, і сира
  // задача винесла б бюджет у браузер тому, кому його бачити не можна
  const task = await getTask(me, Number(id));
  if (!task) notFound();
  if (!can(me, "can_edit_tasks")) redirect(`/tasks/${task.id}`);

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Link href={`/tasks/${task.id}`} className="mb-3 inline-block text-sm text-ink-muted hover:text-ink">
        ← До задачі
      </Link>
      <h1 className="mb-1 text-2xl font-bold">Редагування</h1>
      <p className="mb-5 text-sm text-ink-muted">
        {orderLabel(task)} · про зміни отримають сповіщення виконавець і керівництво.
      </p>
      <TaskForm
        me={me}
        millers={await listMillers()}
        materials={(await listMaterials()).map((m) => m.name)}
        customers={await listCustomers()}
        task={task}
        directUpload={directUploadEnabled()}
        canSeeBudget={can(me, "can_see_budget")}
      />
    </div>
  );
}
