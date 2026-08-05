import { redirect } from "next/navigation";
import { can, requireUser } from "@/lib/auth";
import { listUsers } from "@/lib/queries";
import TeamEditor from "@/components/TeamEditor";

export default async function TeamPage() {
  const me = await requireUser();
  if (!can(me, "can_manage_team")) redirect("/queue");

  return (
    <div className="mx-auto w-full max-w-3xl">
      <h1 className="mb-1 text-2xl font-bold">Команда і права</h1>
      <p className="mb-4 text-sm text-ink-muted">
        Відділ моделювання, фрезерування та їхні можливості в задачнику
      </p>
      <TeamEditor users={listUsers()} meId={me.id} />
    </div>
  );
}
