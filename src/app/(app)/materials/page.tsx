import { redirect } from "next/navigation";
import { can, requireUser } from "@/lib/auth";
import { listMaterials } from "@/lib/queries";
import MaterialsEditor from "@/components/MaterialsEditor";

export default async function MaterialsPage() {
  const me = await requireUser();
  // список веде той, хто й заводить задачі
  if (!can(me, "can_edit_tasks") && !can(me, "can_create_tasks")) redirect("/queue");

  return (
    <div className="mx-auto w-full max-w-2xl">
      <h1 className="mb-1 text-2xl font-bold">Матеріали</h1>
      <p className="mb-4 text-sm text-ink-muted">
        Підказки у формі задачі. У самій задачі зберігається текст, тому правки
        тут не змінюють уже заведені роботи.
      </p>
      <MaterialsEditor materials={await listMaterials()} />
    </div>
  );
}
